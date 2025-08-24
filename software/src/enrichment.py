import polars as pl
import numpy as np
import json
from typing import List, Dict, Optional, Tuple


def filter_clonotypes_by_criteria(
    aggregated_df: pl.DataFrame,
    condition_order: List[str],
    filter_single_sample: bool = False,
    filter_any_zero: bool = False
) -> pl.DataFrame:
    """
    Filter clonotypes based on specified criteria.

    Args:
        aggregated_df: DataFrame with columns [elementId, condition, abundance]
        condition_order: List of conditions in order
        filter_single_sample: If True, remove clonotypes present in only one sample
        filter_any_zero: If True, remove clonotypes with zero abundance in any sample

    Returns:
        Filtered DataFrame with same structure as input
    """
    if not (filter_single_sample or filter_any_zero):
        return aggregated_df

    # Create pivot table to analyze abundance patterns
    pivot_for_filtering = (
        aggregated_df
        .pivot(values='abundance', index='elementId', on='condition', aggregate_function='sum')
        .fill_null(0)
    )

    # Ensure all conditions are present
    for condition in condition_order:
        if condition not in pivot_for_filtering.columns:
            pivot_for_filtering = pivot_for_filtering.with_columns(
                pl.lit(0).alias(condition))

    # Select condition columns in the specified order
    condition_cols = [
        col for col in condition_order if col in pivot_for_filtering.columns]
    pivot_for_filtering = pivot_for_filtering.select(
        ['elementId'] + condition_cols)

    elements_to_keep = None

    if filter_single_sample:
        # Filter out clonotypes present in only one sample (zero abundance in all but one)
        # Count non-zero abundances per clonotype
        non_zero_counts = pivot_for_filtering.with_columns(
            pl.concat_list([pl.when(pl.col(col) > 0).then(
                1).otherwise(0) for col in condition_cols])
            .list.sum()
            .alias('non_zero_count')
        )

        # Keep clonotypes present in more than one sample
        single_sample_filter = non_zero_counts.filter(
            pl.col('non_zero_count') > 1).select('elementId')
        elements_to_keep = single_sample_filter if elements_to_keep is None else elements_to_keep.join(
            single_sample_filter, on='elementId', how='inner')

    if filter_any_zero:
        # Filter out clonotypes with zero abundance in any sample
        # Keep only clonotypes with non-zero abundance in ALL samples
        all_non_zero = pivot_for_filtering.with_columns(
            pl.concat_list([pl.when(pl.col(col) > 0).then(
                1).otherwise(0) for col in condition_cols])
            .list.sum()
            .alias('non_zero_count')
        )

        # Keep clonotypes present in ALL samples
        any_zero_filter = all_non_zero.filter(
            pl.col('non_zero_count') == len(condition_cols)).select('elementId')
        elements_to_keep = any_zero_filter if elements_to_keep is None else elements_to_keep.join(
            any_zero_filter, on='elementId', how='inner')

    if elements_to_keep is not None:
        # Filter the original aggregated data
        filtered_df = aggregated_df.join(
            elements_to_keep, on='elementId', how='inner')
        return filtered_df
    else:
        return aggregated_df


def hybrid_enrichment_analysis(
    input_data_csv: str,
    condition_order: List[str],
    enrichment_csv: str,
    bubble_csv: str,
    top_enriched_csv: str,
    top_20_csv: Optional[str] = None,
    highest_enrichment_csv: Optional[str] = None,
    use_penalty: bool = True,
    penalty_enrich: int = 2,
    penalty_deplete: int = 10,
    top_n_bubble: int = 20,
    top_n_enriched: int = 5,
    min_enrichment: float = 3,
    filter_clonotypes: bool = False,
    filter_single_sample: bool = False,
    filter_any_zero: bool = False,
    clonotype_definition_csv: Optional[str] = None
) -> None:
    """
    Optimized hybrid enrichment analysis using polars for better performance and memory efficiency.

    New filtering options:
    - filter_clonotypes: Enable clonotype filtering before enrichment calculation
    - filter_single_sample: Remove clonotypes present in only one sample (zero abundance in all but one)
    - filter_any_zero: Remove clonotypes absent in any sample (zero abundance in any sample)
    """
    # Read data with polars lazy evaluation
    input_df = pl.scan_csv(input_data_csv)

    if clonotype_definition_csv:
        clonotype_def_df = pl.scan_csv(clonotype_definition_csv)

        # Eagerly collect to perform join
        input_df = input_df.collect()
        clonotype_def_df = clonotype_def_df.collect()

        # Join with main data
        input_df = input_df.join(clonotype_def_df, on='elementId', how='left')

        clonotype_def_cols = [
            col for col in input_df.columns if col.startswith('clonotypeDefinition_')]

        if clonotype_def_cols:
            # Calculate new abundance
            grouped_abundance = input_df.group_by(clonotype_def_cols + ['condition']).agg(
                pl.col('downsampledAbundance').sum().alias('new_abundance')
            )

            # Join back to get the new abundance for each row
            input_df = input_df.join(
                grouped_abundance, on=clonotype_def_cols + ['condition'], how='left')

            # Replace original abundance
            input_df = input_df.with_columns(
                pl.col('new_abundance').alias('downsampledAbundance')
            ).drop('new_abundance')

        # Continue with lazy evaluation
        input_df = input_df.lazy()

    # Make sure condition_order is a list of strings
    condition_order = [str(cond) for cond in condition_order]

    # Rename and validate columns
    input_df = input_df.rename({"downsampledAbundance": "abundance"})

    # Validate expected columns - collect only schema to avoid loading full data
    schema = input_df.collect_schema()
    expected_cols = {'sampleId', 'elementId', 'abundance', 'condition'}
    missing_cols = expected_cols - set(schema.names())
    if missing_cols:
        raise ValueError(
            f"Missing expected columns: {', '.join(missing_cols)}")

    # Select only needed columns to reduce memory and ensure condition is string type
    input_df = input_df.select(['elementId', 'abundance', 'condition']).with_columns(
        pl.col('condition').cast(pl.Utf8))

    # Calculate total reads per condition efficiently
    total_reads = (
        input_df
        .group_by('condition')
        .agg(pl.col('abundance').sum().alias('total_reads'))
        .collect()
        .to_dict(as_series=False)
    )
    total_reads_dict = dict(
        zip(total_reads['condition'], total_reads['total_reads']))

    # Create aggregated data first, then pivot (pivot requires DataFrame, not LazyFrame)
    aggregated_df = (
        input_df
        .group_by(['elementId', 'condition'])
        .agg(pl.col('abundance').sum().alias('abundance'))
        .collect()
    )

    # Generate consistent labels BEFORE filtering based on alphabetical elementId order
    # This ensures each clonotype gets the same label regardless of filtering
    all_element_ids = aggregated_df.select(
        'elementId').unique().sort('elementId')
    label_mapping = all_element_ids.with_row_index("_row_index").with_columns(
        (pl.col('_row_index') +
         1).map_elements(lambda x: f"C{int(x)}", return_dtype=pl.Utf8).alias('Label')
    ).select(['elementId', 'Label'])

    # Apply clonotype filtering if requested
    if filter_clonotypes:
        aggregated_df = filter_clonotypes_by_criteria(
            aggregated_df, condition_order, filter_single_sample, filter_any_zero
        )

    # Create pivot table to match pandas behavior exactly (elementId as index)
    pivot_df = (
        aggregated_df
        .pivot(values='abundance', index='elementId', on='condition', aggregate_function='sum')
        .fill_null(0)
    )

    # Ensure all conditions are present in pivot
    for condition in condition_order:
        if condition not in pivot_df.columns:
            pivot_df = pivot_df.with_columns(pl.lit(0).alias(condition))

    # Convert elementId to index by setting it aside (to match pandas index behavior)
    pivot_df = pivot_df.sort('elementId')  # Ensure consistent ordering
    element_ids = pivot_df.select('elementId').to_series()

    # CRITICAL: Ensure column order matches pandas exactly (pandas unstack creates alphabetical order)
    condition_cols = [col for col in pivot_df.columns if col != 'elementId']
    # pandas unstack creates alphabetical order
    condition_cols_sorted = sorted(condition_cols)
    pivot_df = pivot_df.select(condition_cols_sorted)

    # Pre-calculate frequencies for all conditions efficiently
    freq_expressions = []
    for condition in condition_order:
        total = total_reads_dict.get(condition, 1)
        if total == 0:
            total = 1
        freq_expressions.append(
            (pl.col(condition) / total).alias(f'freq_{condition}')
        )

    # Add frequency columns
    pivot_df = pivot_df.with_columns(freq_expressions)

    # Calculate enrichments efficiently using vectorized operations
    enrichment_results = _calculate_enrichments_vectorized(
        pivot_df, condition_order, total_reads_dict, use_penalty, penalty_enrich, penalty_deplete
    )

    # Add elementId back as the first column (matching pandas index->column conversion)
    enrichment_results = enrichment_results.with_columns(
        pl.Series('elementId', element_ids)
    )

    # Apply label mapping to the enriched results
    enrichment_results = enrichment_results.join(
        label_mapping, on='elementId', how='left')

    # Reorder columns to match original pandas implementation: elementId, Label, then other columns
    other_cols = [col for col in enrichment_results.columns if col not in [
        'elementId', 'Label']]
    enrichment_results = enrichment_results.select(
        ['elementId', 'Label'] + other_cols)

    # Save main enrichment results
    enrichment_results.write_csv(enrichment_csv)

    # Process outputs efficiently
    _process_outputs(
        enrichment_results, condition_order, bubble_csv, top_enriched_csv,
        top_20_csv, highest_enrichment_csv, top_n_bubble, top_n_enriched, min_enrichment
    )


def _calculate_enrichments_vectorized(
    pivot_df: pl.DataFrame,
    condition_order: List[str],
    total_reads_dict: Dict[str, int],
    use_penalty: bool,
    penalty_enrich: int,
    penalty_deplete: int
) -> pl.DataFrame:
    """
    Calculate enrichments using vectorized operations for better performance.
    """
    # Calculate min non-zero abundance for penalty calculations
    abundance_cols = [
        col for col in pivot_df.columns if col in condition_order]

    if use_penalty:
        # Calculate min non-zero abundance per row efficiently
        min_nonzero_expr = pl.concat_list([
            pl.when(pl.col(col) > 0).then(pl.col(col)).otherwise(None)
            for col in abundance_cols
        ]).list.min().fill_null(1).alias('min_nonzero_abundance')

        pivot_df = pivot_df.with_columns(min_nonzero_expr)

    # Calculate all pairwise enrichments efficiently
    enrichment_exprs = []
    freq_exprs = []
    enrichment_col_names = []  # Track enrichment column names explicitly

    for i, condition in enumerate(condition_order):
        freq_exprs.append(pl.col(f'freq_{condition}').alias(
            f'Frequency {condition}'))

    for num_i in range(1, len(condition_order)):
        for den_j in range(num_i):
            numerator = condition_order[num_i]
            denominator = condition_order[den_j]
            enrichment_col_name = f'Enrichment {numerator} vs {denominator}'
            enrichment_col_names.append(enrichment_col_name)

            if use_penalty:
                # This logic has been rewritten to EXACTLY match the original pandas implementation.
                # The original code creates two separate frequency dictionaries (num_freqs, den_freqs)
                # and only populates them if certain conditions are met. This vectorized version
                # replicates that behavior precisely.

                # Numerator frequency expression:
                # A penalty is applied only if the clonotype abundance is 0 AND it's not the FIRST condition.
                num_freq_expr = pl.when(pl.col(numerator) > 0).then(
                    pl.col(f'freq_{numerator}')
                ).otherwise(
                    pl.when(numerator != condition_order[0]).then(
                        pl.col('min_nonzero_abundance').cast(pl.Float64) /
                        (penalty_deplete * total_reads_dict.get(numerator, 1))
                        # Use 0.0 if it's the first condition with 0 abundance
                    ).otherwise(0.0)
                )

                # Denominator frequency expression:
                # A penalty is applied only if the clonotype abundance is 0 AND it's not the LAST condition.
                den_freq_expr = pl.when(pl.col(denominator) > 0).then(
                    pl.col(f'freq_{denominator}')
                ).otherwise(
                    pl.when(denominator != condition_order[-1]).then(
                        pl.col('min_nonzero_abundance').cast(
                            pl.Float64) / (penalty_enrich * total_reads_dict.get(denominator, 1))
                        # Use 0.0 if it's the last condition with 0 abundance
                    ).otherwise(0.0)
                )
            else:
                # Fixed bug for no_penalty case: add pseudocount for 0 abundance
                num_total = total_reads_dict.get(numerator, 1)
                num_freq_expr = pl.when(pl.col(numerator) > 0).then(
                    pl.col(f'freq_{numerator}')
                ).otherwise(1.0 / num_total)

                den_total = total_reads_dict.get(denominator, 1)
                den_freq_expr = pl.when(pl.col(denominator) > 0).then(
                    pl.col(f'freq_{denominator}')
                ).otherwise(1.0 / den_total)

            # Calculate enrichment with proper handling of edge cases
            enrichment_expr = (
                pl.when(den_freq_expr > 0)
                .then((num_freq_expr / den_freq_expr).log(2))
                .otherwise(None)
                .alias(enrichment_col_name)
            )

            enrichment_exprs.append(enrichment_expr)

    # Add frequency and enrichment columns first
    result_df = pivot_df.with_columns(freq_exprs + enrichment_exprs)

    # Now calculate max positive enrichment to match original pandas behavior
    if enrichment_col_names:
        # Match original pandas behavior: clip negative values to 0, then find max
        max_pos_enrich_expr = pl.concat_list([
            pl.when(pl.col(col).is_null()).then(
                0).otherwise(pl.col(col).clip(lower_bound=0))
            for col in enrichment_col_names
        ]).list.max().alias('MaxPositiveEnrichment')

        result_df = result_df.with_columns(max_pos_enrich_expr)

    # Select only needed columns (elementId will be added back in main function)
    freq_col_names = [
        f'Frequency {condition}' for condition in condition_order]
    result_cols = freq_col_names + enrichment_col_names
    if enrichment_col_names:  # Only add MaxPositiveEnrichment if we have enrichment columns
        result_cols.append('MaxPositiveEnrichment')
    return result_df.select(result_cols)


def _process_outputs(
    enrichment_results: pl.DataFrame,
    condition_order: List[str],
    bubble_csv: str,
    top_enriched_csv: str,
    top_20_csv: Optional[str],
    highest_enrichment_csv: Optional[str],
    top_n_bubble: int,
    top_n_enriched: int,
    min_enrichment: float
) -> None:
    """
    Process and save output files efficiently.
    """
    # Process enrichment data for detailed output
    enrichment_cols = [
        col for col in enrichment_results.columns if col.startswith('Enrichment ')]

    if enrichment_cols:
        # Create detailed enrichment table efficiently
        enrichment_detailed = _create_detailed_enrichment_table(
            enrichment_results, enrichment_cols, condition_order
        )

        # Save highest enrichment if requested
        if highest_enrichment_csv:
            highest_enrichment = (
                enrichment_detailed
                .filter(pl.col('Enrichment').is_not_null())
                .group_by(['elementId', 'Label'])
                .agg(pl.all().sort_by(['Enrichment', 'elementId'], descending=[True, False]).first())
                .sort(['Enrichment', 'elementId'], descending=[True, False])
            )
            highest_enrichment.write_csv(highest_enrichment_csv)

        # Process bubble data
        bubble_data = _create_bubble_data(
            enrichment_results, condition_order, top_n_bubble, min_enrichment
        )
        bubble_data.write_csv(bubble_csv)

        # Process top enriched data
        top_enriched_data = _create_top_enriched_data(
            enrichment_results, condition_order, bubble_data, top_n_enriched
        )
        top_enriched_data.write_csv(top_enriched_csv)

        # Process top 20 data if requested
        if top_20_csv:
            top_20_data = _create_top_enriched_data(
                enrichment_results, condition_order, bubble_data, 20
            )
            top_20_data.write_csv(top_20_csv)
    else:
        # Create empty outputs if no enrichment columns
        empty_cols = ['elementId', 'Label', 'Comparison', 'Numerator',
                      'Denominator', 'Enrichment', 'Frequency_Numerator']
        empty_df = pl.DataFrame(schema={col: pl.Utf8 if col in [
                                'elementId', 'Label', 'Comparison', 'Numerator', 'Denominator'] else pl.Float64 for col in empty_cols})

        empty_df.write_csv(bubble_csv)
        empty_df.write_csv(top_enriched_csv)
        if top_20_csv:
            empty_df.write_csv(top_20_csv)
        if highest_enrichment_csv:
            empty_df.write_csv(highest_enrichment_csv)


def _create_detailed_enrichment_table(
    enrichment_results: pl.DataFrame,
    enrichment_cols: List[str],
    condition_order: List[str]
) -> pl.DataFrame:
    """
    Create detailed enrichment table efficiently using polars operations.
    """
    # Melt enrichment data
    enrichment_melted = (
        enrichment_results
        .select(['elementId', 'Label'] + enrichment_cols)
        .melt(
            id_vars=['elementId', 'Label'],
            value_vars=enrichment_cols,
            variable_name='Comparison',
            value_name='Enrichment'
        )
        .filter(pl.col('Enrichment').is_not_null())
    )

    # Extract numerator and denominator
    enrichment_melted = enrichment_melted.with_columns([
        pl.col('Comparison').str.replace(
            'Enrichment ', '').alias('comparison_clean'),
        pl.col('Comparison').str.replace('Enrichment ', '').str.split(
            ' vs ').list.get(0).alias('Numerator'),
        pl.col('Comparison').str.replace('Enrichment ', '').str.split(
            ' vs ').list.get(1).alias('Denominator')
    ])

    # Add frequency data
    freq_cols = [f'Frequency {cond}' for cond in condition_order]
    freq_melted = (
        enrichment_results
        .select(['elementId', 'Label'] + freq_cols)
        .melt(
            id_vars=['elementId', 'Label'],
            value_vars=freq_cols,
            variable_name='ConditionFull',
            value_name='Frequency_Numerator'
        )
        .with_columns(
            pl.col('ConditionFull').str.replace(
                'Frequency ', '').alias('Numerator')
        )
        .select(['elementId', 'Label', 'Numerator', 'Frequency_Numerator'])
    )

    # Join enrichment with frequency data
    result = enrichment_melted.join(
        freq_melted,
        on=['elementId', 'Label', 'Numerator'],
        how='left'
    ).select([
        'elementId', 'Label', 'comparison_clean', 'Numerator', 'Denominator', 'Enrichment', 'Frequency_Numerator'
    ]).rename({'comparison_clean': 'Comparison'})

    return result


def _create_bubble_data(
    enrichment_results: pl.DataFrame,
    condition_order: List[str],
    top_n_bubble: int,
    min_enrichment: float
) -> pl.DataFrame:
    """
    Create bubble plot data efficiently.
    """
    # Filter by minimum enrichment
    filtered_data = enrichment_results.filter(
        pl.col('MaxPositiveEnrichment') >= min_enrichment
    )

    if filtered_data.height == 0:
        return pl.DataFrame(schema={
            'elementId': pl.Utf8, 'Label': pl.Utf8, 'Numerator': pl.Utf8,
            'Denominator': pl.Utf8, 'Enrichment': pl.Float64,
            'Frequency_Numerator': pl.Float64, 'MaxPositiveEnrichment': pl.Float64
        })

    # Get top clonotypes
    top_clonotypes = (
        filtered_data
        .group_by('elementId')
        .agg(pl.col('MaxPositiveEnrichment').max())
        .sort(['MaxPositiveEnrichment', 'elementId'], descending=[True, False])
        .head(top_n_bubble)
        .select('elementId')
    )

    # Filter data for top clonotypes
    bubble_data = filtered_data.join(
        top_clonotypes, on='elementId', how='inner')

    # Create bubble data efficiently
    enrichment_cols = [
        col for col in bubble_data.columns if col.startswith('Enrichment ')]
    bubble_rows = []

    for row in bubble_data.iter_rows(named=True):
        element_id = row['elementId']
        label = row['Label']
        max_pos_enrich = row['MaxPositiveEnrichment']

        for col in enrichment_cols:
            enrich_val = row[col]
            if enrich_val is not None and enrich_val > 0:
                # Parse comparison
                comparison = col.replace('Enrichment ', '')
                numerator, denominator = comparison.split(' vs ')
                freq_val = row.get(f'Frequency {numerator}', None)

                bubble_rows.append({
                    'elementId': element_id,
                    'Label': label,
                    'Numerator': numerator,
                    'Denominator': denominator,
                    'Enrichment': enrich_val,
                    'Frequency_Numerator': freq_val,
                    'MaxPositiveEnrichment': max_pos_enrich
                })

    if bubble_rows:
        return pl.DataFrame(bubble_rows)
    else:
        return pl.DataFrame(schema={
            'elementId': pl.Utf8, 'Label': pl.Utf8, 'Numerator': pl.Utf8,
            'Denominator': pl.Utf8, 'Enrichment': pl.Float64,
            'Frequency_Numerator': pl.Float64, 'MaxPositiveEnrichment': pl.Float64
        })


def _create_top_enriched_data(
    enrichment_results: pl.DataFrame,
    condition_order: List[str],
    bubble_data: pl.DataFrame,
    top_n: int
) -> pl.DataFrame:
    """
    Create top enriched frequency data efficiently.
    """
    if bubble_data.height == 0:
        return pl.DataFrame(schema={
            'elementId': pl.Utf8, 'Label': pl.Utf8, 'Condition': pl.Utf8, 'Frequency': pl.Float64
        })

    # Get top element IDs
    top_ids = (
        bubble_data
        .group_by('elementId')
        .agg(pl.col('MaxPositiveEnrichment').max())
        .sort(['MaxPositiveEnrichment', 'elementId'], descending=[True, False])
        .head(top_n)
        .select('elementId')
    )

    # Create frequency data
    freq_cols = [f'Frequency {cond}' for cond in condition_order]
    freq_data = (
        enrichment_results
        .join(top_ids, on='elementId', how='inner')
        .select(['elementId', 'Label'] + freq_cols)
        .melt(
            id_vars=['elementId', 'Label'],
            value_vars=freq_cols,
            variable_name='ConditionFull',
            value_name='Frequency'
        )
        .with_columns(
            pl.col('ConditionFull').str.replace(
                'Frequency ', '').alias('Condition')
        )
        .select(['elementId', 'Label', 'Condition', 'Frequency'])
    )

    return freq_data


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Optimized Hybrid Enrichment Analysis")
    parser.add_argument("--input_data", required=True,
                        help="Path to the combined input CSV file. Expected columns: sampleId, elementId, abundance, downsampledAbundance, and condition.")
    parser.add_argument("--conditions", type=str, required=True)
    parser.add_argument("--enrichment", required=True)
    parser.add_argument("--bubble", required=True)
    parser.add_argument("--top_enriched", required=True)
    parser.add_argument("--top_20", required=False)
    parser.add_argument("--highest_enrichment_clonotype", required=False,
                        help="Optional CSV output for rows with the highest enrichment per elementId-Label combination.")
    parser.add_argument("--use_penalty", action="store_true")
    parser.add_argument("--penalty_enrich", type=int, default=2)
    parser.add_argument("--penalty_deplete", type=int, default=10)
    parser.add_argument("--top_n_bubble", type=int, default=20)
    parser.add_argument("--top_n_enriched", type=int, default=5)
    parser.add_argument("--min_enrichment", required=False,
                        type=float, default=0)
    parser.add_argument("--filter_clonotypes", action="store_true",
                        help="Enable clonotype filtering before enrichment calculation")
    parser.add_argument("--filter_single_sample", action="store_true",
                        help="Remove clonotypes present in only one sample (zero abundance in all but one)")
    parser.add_argument("--filter_any_zero", action="store_true",
                        help="Remove clonotypes absent in any sample (zero abundance in any sample)")
    parser.add_argument("--clonotype-definition", required=False,
                        help="Path to clonotype definition CSV file.")

    args = parser.parse_args()

    hybrid_enrichment_analysis(
        input_data_csv=args.input_data,
        condition_order=json.loads(args.conditions),
        enrichment_csv=args.enrichment,
        bubble_csv=args.bubble,
        top_enriched_csv=args.top_enriched,
        top_20_csv=args.top_20,
        highest_enrichment_csv=args.highest_enrichment_clonotype,
        use_penalty=args.use_penalty,
        penalty_enrich=args.penalty_enrich,
        penalty_deplete=args.penalty_deplete,
        top_n_bubble=args.top_n_bubble,
        top_n_enriched=args.top_n_enriched,
        min_enrichment=args.min_enrichment,
        filter_clonotypes=args.filter_clonotypes,
        filter_single_sample=args.filter_single_sample,
        filter_any_zero=args.filter_any_zero,
        clonotype_definition_csv=args.clonotype_definition
    )
