import polars as pl
import numpy as np
import json
from typing import List, Dict, Optional, Tuple


def filter_clonotypes_by_criteria(
    aggregated_df: pl.DataFrame,
    condition_order: List[str],
    filter_single_sample: bool = False,
    filter_any_zero: bool = False,
    min_abundance: int = 0,
    min_frequency: float = 0.0,
    total_reads_dict: Optional[Dict[str, int]] = None,
    present_in_rounds: Optional[List[str]] = None,
    present_in_rounds_logic: str = "OR",
    pseudo_count: float = 0.0,
    n_clonotypes: Optional[int] = None
) -> pl.DataFrame:
    """
    Filter clonotypes based on specified criteria.

    Args:
        aggregated_df: DataFrame with columns [elementId, condition, abundance]
        condition_order: List of conditions in order
        filter_single_sample: If True, remove clonotypes present in only one sample
        filter_any_zero: If True, remove clonotypes with zero abundance in any sample
        min_abundance: If > 0, remove clonotypes with maximum abundance below this threshold
        min_frequency: If > 0, remove clonotypes with maximum frequency below this threshold (0-1)
        total_reads_dict: Dictionary mapping condition to total reads (required for min_frequency)
        present_in_rounds: Optional list of rounds to filter clonotypes by presence
        present_in_rounds_logic: Logic for presence filtering ('OR' or 'AND')
        pseudo_count: Pseudo-count for frequency normalization
        n_clonotypes: Number of unique clonotypes (for proper pseudo-count normalization)

    Returns:
        Filtered DataFrame with same structure as input
    """
    if not (filter_single_sample or filter_any_zero or min_abundance > 0 or 
            (min_frequency > 0 and total_reads_dict) or present_in_rounds):
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

    if min_abundance > 0:
        # Filter out clonotypes with maximum abundance below threshold
        min_abundance_filter = pivot_for_filtering.filter(
            pl.any_horizontal([pl.col(col) >= min_abundance for col in condition_cols])
        ).select('elementId')
        elements_to_keep = min_abundance_filter if elements_to_keep is None else elements_to_keep.join(
            min_abundance_filter, on='elementId', how='inner')

    if min_frequency > 0 and total_reads_dict:
        # Filter out clonotypes with maximum frequency below threshold
        # Create expressions for frequency check in each condition
        freq_filters = []
        for col in condition_cols:
            total = total_reads_dict.get(col, 0)
            if total >= 1:
                # Use same frequency formula with pseudocount as in enrichment calculation
                # Denominator must include n_clonotypes * pseudo_count to ensure frequencies sum to 1
                freq_filters.append((pl.col(col) + pseudo_count) / (total + (n_clonotypes * pseudo_count)) >= min_frequency)
        
        if freq_filters:
            min_frequency_filter = pivot_for_filtering.filter(
                pl.any_horizontal(freq_filters)
            ).select('elementId')
            elements_to_keep = min_frequency_filter if elements_to_keep is None else elements_to_keep.join(
                min_frequency_filter, on='elementId', how='inner')

    if present_in_rounds and len(present_in_rounds) > 0:
        # Filter by presence in specific rounds
        # Ensure selected rounds exist in data
        existing_rounds = [r for r in present_in_rounds if r in pivot_for_filtering.columns and r in condition_order]
        
        if existing_rounds:
            logic = present_in_rounds_logic.upper()
            if logic == "AND":
                presence_filter = pivot_for_filtering.filter(
                    pl.all_horizontal([pl.col(col) > 0 for col in existing_rounds])
                ).select('elementId')
            else:  # Default to OR
                presence_filter = pivot_for_filtering.filter(
                    pl.any_horizontal([pl.col(col) > 0 for col in existing_rounds])
                ).select('elementId')
                
            elements_to_keep = presence_filter if elements_to_keep is None else elements_to_keep.join(
                presence_filter, on='elementId', how='inner')

    if elements_to_keep is not None:
        # Filter the original aggregated data
        filtered_df = aggregated_df.join(
            elements_to_keep, on='elementId', how='inner')
        return filtered_df
    else:
        return aggregated_df


def create_empty_outputs(
    condition_order: List[str],
    enrichment_csv: str,
    bubble_csv: str,
    top_enriched_csv: str,
    top_20_csv: Optional[str] = None,
    highest_enrichment_csv: Optional[str] = None,
    filtered_too_much_txt: Optional[str] = None
) -> None:
    """
    Create empty output files when input data is empty.
    """
    # Create empty enrichment results with all expected columns
    enrichment_schema = {
        'elementId': pl.Utf8,
        'Label': pl.Utf8
    }
    
    ## Add frequency columns for each condition
    for condition in condition_order:
        enrichment_schema[f'Frequency {condition}'] = pl.Float64
    ## Add enrichment columns for all possible comparisons
    for num_i in range(1, len(condition_order)):
        for den_j in range(num_i):
            numerator = condition_order[num_i]
            denominator = condition_order[den_j]
            enrichment_schema[f'Enrichment {numerator} vs {denominator}'] = pl.Float64
    ## Add MaxPositiveEnrichment column
    enrichment_schema['MaxPositiveEnrichment'] = pl.Float64
    
    empty_enrichment = pl.DataFrame(schema=enrichment_schema)
    empty_enrichment.write_csv(enrichment_csv)
    
    # Create empty bubble data with proper schema
    empty_bubble = pl.DataFrame(schema={
        'elementId': pl.Utf8, 'Label': pl.Utf8, 'Numerator': pl.Utf8,
        'Denominator': pl.Utf8, 'Enrichment': pl.Float64,
        'Frequency_Numerator': pl.Float64, 'MaxPositiveEnrichment': pl.Float64
    })
    empty_bubble.write_csv(bubble_csv)
    
    # Create empty top enriched data with proper schema
    empty_top_enriched = pl.DataFrame(schema={
        'elementId': pl.Utf8, 'Label': pl.Utf8, 'Condition': pl.Utf8, 'Frequency': pl.Float64
    })
    empty_top_enriched.write_csv(top_enriched_csv)
    
    # Create empty top 20 data if requested
    if top_20_csv:
        empty_top_enriched.write_csv(top_20_csv)
    
    # Create empty highest enrichment data with proper schema
    if highest_enrichment_csv:
        empty_highest = pl.DataFrame(schema={
            'elementId': pl.Utf8, 'Label': pl.Utf8, 'Comparison': pl.Utf8,
            'Numerator': pl.Utf8, 'Denominator': pl.Utf8, 'Enrichment': pl.Float64,
            'Frequency_Numerator': pl.Float64
        })
        empty_highest.write_csv(highest_enrichment_csv)

    # Create filter check file
    if filtered_too_much_txt:
        with open(filtered_too_much_txt, 'w') as f:
            f.write("false")


def hybrid_enrichment_analysis(
    input_data_csv: str,
    condition_order: List[str],
    enrichment_csv: str,
    bubble_csv: str,
    top_enriched_csv: str,
    top_20_csv: Optional[str] = None,
    highest_enrichment_csv: Optional[str] = None,
    top_n_bubble: int = 20,
    top_n_enriched: int = 5,
    min_enrichment: float = 3,
    filter_clonotypes: bool = False,
    filter_single_sample: bool = False,
    filter_any_zero: bool = False,
    min_abundance: int = 0,
    min_frequency: float = 0.0,
    present_in_rounds: Optional[List[str]] = None,
    present_in_rounds_logic: str = "OR",
    clonotype_definition_csv: Optional[str] = None,
    filtered_too_much_txt: Optional[str] = None,
    pseudo_count: float = 0.0
) -> None:
    """
    Optimized hybrid enrichment analysis using polars for better performance and memory efficiency.

    New filtering options:
    - filter_clonotypes: Enable clonotype filtering before enrichment calculation
    - filter_single_sample: Remove clonotypes present in only one sample (zero abundance in all but one)
    - filter_any_zero: Remove clonotypes absent in any sample (zero abundance in any sample)
    - min_abundance: Minimum abundance threshold for clonotypes (maximum across all conditions >= threshold)
    - present_in_rounds: List of rounds to filter clonotypes by presence
    - present_in_rounds_logic: Logic for presence filtering ('OR' or 'AND')
    - pseudo_count: Constant to add to abundance values for enrichment and frequency calculation
    """
    # Read data with polars lazy evaluation
    input_df = pl.scan_csv(input_data_csv)
    
    # Check if input data is empty (no clonotypes)
    ## Check if there are any non-null, non-empty elementId value in lazy frame
    element_count = input_df.filter(
        pl.col('elementId').is_not_null() & 
        (pl.col('elementId') != "")
    ).select(pl.len()).collect().item()
    if element_count == 0:
        # Create empty outputs and exit
        create_empty_outputs(condition_order, enrichment_csv, bubble_csv,
                                top_enriched_csv, top_20_csv, highest_enrichment_csv,
                                filtered_too_much_txt)
        return

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
    if present_in_rounds:
        present_in_rounds = [str(cond) for cond in present_in_rounds]

    # Rename and validate columns
    if "abundance" in input_df.columns:
        input_df = input_df.drop("abundance")
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

    # Calculate number of unique clonotypes
    n_clonotypes = aggregated_df.select('elementId').n_unique()

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
            aggregated_df, condition_order, 
            filter_single_sample, filter_any_zero, min_abundance,
            min_frequency, total_reads_dict,
            present_in_rounds, present_in_rounds_logic,
            pseudo_count, n_clonotypes
        )

    # Check if we have too few clonotypes after filtering
    if filtered_too_much_txt:
        unique_clonotypes_count = aggregated_df.select('elementId').n_unique()
        too_few = "true" if (unique_clonotypes_count < 1) else "false"
        with open(filtered_too_much_txt, 'w') as f:
            f.write(too_few)

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
        # Add pseudo_count to each clonotype's abundance, so total must be adjusted by n_clonotypes * pseudo_count
        # This ensures frequencies sum to 1: Σ[(abundance + p) / (total + N*p)] = 1
        freq_expressions.append(
            ((pl.col(condition) + pseudo_count) / (total + (n_clonotypes * pseudo_count))).alias(f'freq_{condition}')
        )

    # Add frequency columns
    pivot_df = pivot_df.with_columns(freq_expressions)

    # Calculate enrichments efficiently using vectorized operations
    enrichment_results = _calculate_enrichments_vectorized(
        pivot_df, condition_order, total_reads_dict
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
    total_reads_dict: Dict[str, int]
) -> pl.DataFrame:
    """
    Calculate enrichments using vectorized operations for better performance.
    """
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

            # Calculate enrichment: only when both numerator and denominator are non-zero
            num_freq_expr = pl.col(f'freq_{numerator}')
            den_freq_expr = pl.col(f'freq_{denominator}')

            enrichment_expr = (
                pl.when((num_freq_expr > 0) & (den_freq_expr > 0))
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
    parser.add_argument("--min_abundance", type=int, default=0,
                        help="Minimum abundance threshold for clonotypes (maximum across all conditions)")
    parser.add_argument("--min_frequency", type=float, default=0.0,
                        help="Minimum frequency threshold for clonotypes (maximum across all conditions) (0-1)")
    parser.add_argument("--present_in_rounds", type=str, required=False,
                        help="JSON list of rounds to filter clonotypes by presence")
    parser.add_argument("--present_in_rounds_logic", type=str, default="OR",
                        help="Logic for presence filtering ('OR' or 'AND')")
    parser.add_argument("--clonotype-definition", required=False,
                        help="Path to clonotype definition CSV file.")
    parser.add_argument("--filtered_too_much", required=False,
                        help="Path to save whether filters left too few clonotypes (true/false)")
    parser.add_argument("--pseudo_count", type=float, default=0.0,
                        help="Constant to add to abundance values for enrichment and frequency calculations")

    args = parser.parse_args()

    hybrid_enrichment_analysis(
        input_data_csv=args.input_data,
        condition_order=json.loads(args.conditions),
        enrichment_csv=args.enrichment,
        bubble_csv=args.bubble,
        top_enriched_csv=args.top_enriched,
        top_20_csv=args.top_20,
        highest_enrichment_csv=args.highest_enrichment_clonotype,
        top_n_bubble=args.top_n_bubble,
        top_n_enriched=args.top_n_enriched,
        min_enrichment=args.min_enrichment,
        filter_clonotypes=args.filter_clonotypes,
        filter_single_sample=args.filter_single_sample,
        filter_any_zero=args.filter_any_zero,
        min_abundance=args.min_abundance,
        min_frequency=args.min_frequency,
        present_in_rounds=json.loads(args.present_in_rounds) if args.present_in_rounds else None,
        present_in_rounds_logic=args.present_in_rounds_logic,
        clonotype_definition_csv=args.clonotype_definition,
        filtered_too_much_txt=args.filtered_too_much,
        pseudo_count=args.pseudo_count
    )
