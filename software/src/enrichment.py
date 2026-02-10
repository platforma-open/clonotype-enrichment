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
        if condition not in pivot_for_filtering.collect_schema().names():
            pivot_for_filtering = pivot_for_filtering.with_columns(
                pl.lit(0).alias(condition))

    # Select condition columns in the specified order
    condition_cols = [
        col for col in condition_order if col in pivot_for_filtering.collect_schema().names()]
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
        existing_rounds = [r for r in present_in_rounds if r in pivot_for_filtering.collect_schema().names() and r in condition_order]
        
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
    top_10_csv: Optional[str] = None,
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
    enrichment_schema['Overall Log2FC'] = pl.Float64
    enrichment_schema['MaxNegControlEnrichment'] = pl.Float64
    enrichment_schema['PresentInNegControl'] = pl.Boolean
    enrichment_schema['Binding Specificity'] = pl.Utf8
    enrichment_schema['EnrichmentQuality'] = pl.Utf8
    
    empty_enrichment = pl.DataFrame(schema=enrichment_schema)
    empty_enrichment.write_csv(enrichment_csv)
    
    # Create empty bubble data with proper schema
    empty_bubble = pl.DataFrame(schema={
        'elementId': pl.Utf8, 'Label': pl.Utf8, 'Numerator': pl.Utf8,
        'Denominator': pl.Utf8, 'Enrichment': pl.Float64,
        'Frequency_Numerator': pl.Float64, 'MaxPositiveEnrichment': pl.Float64,
        'Binding Specificity': pl.Utf8, 'MaxNegControlEnrichment': pl.Float64, 'PresentInNegControl': pl.Boolean,
        'EnrichmentQuality': pl.Utf8
    })
    empty_bubble.write_csv(bubble_csv)
    
    # Create empty top enriched data with proper schema
    empty_top_enriched = pl.DataFrame(schema={
        'elementId': pl.Utf8, 'Label': pl.Utf8, 'Condition': pl.Utf8, 'Frequency': pl.Float64,
        'Binding Specificity': pl.Utf8, 'MaxNegControlEnrichment': pl.Float64, 'PresentInNegControl': pl.Boolean,
        'EnrichmentQuality': pl.Utf8
    })
    empty_top_enriched.write_csv(top_enriched_csv)
    
    # Create empty top 20 data if requested
    if top_10_csv:
        empty_top_enriched.write_csv(top_10_csv)
    
    # Create empty highest enrichment data with proper schema
    if highest_enrichment_csv:
        empty_highest = pl.DataFrame(schema={
            'elementId': pl.Utf8, 'Label': pl.Utf8, 'Comparison': pl.Utf8,
            'Numerator': pl.Utf8, 'Denominator': pl.Utf8, 'Enrichment': pl.Float64,
            'Frequency_Numerator': pl.Float64, 
            'Overall Log2FC': pl.Float64,
            'MaxPositiveEnrichment': pl.Float64,
            'Binding Specificity': pl.Utf8, 'MaxNegControlEnrichment': pl.Float64, 'PresentInNegControl': pl.Boolean,
            'EnrichmentQuality': pl.Utf8
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
    top_10_csv: Optional[str] = None,
    highest_enrichment_csv: Optional[str] = None,
    top_n_bubble: int = 10,
    top_n_enriched: int = 10,
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
    pseudo_count: float = 0.0,
    control_enabled: bool = False,
    negative_antigens: Optional[List[str]] = None,
    control_conditions_order: Optional[List[str]] = None,
    enrichment_threshold: float = 2.0,
    control_threshold: float = 1.0,
    single_control_fc_threshold: float = 10.0,
    single_control_frequency_threshold: float = 0.01,
    current_target: Optional[str] = None,
    sequenced_library_enabled: bool = False,
    sequenced_library_sample_id: Optional[str] = None,
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
    - control_enabled: Enable negative control specificity filtering
    - negative_antigens: List of negative antigen names
    - control_conditions_order: List of ordered conditions where negative antigens are present
    - enrichment_threshold: Log2 fold change threshold for target conditions
    - control_threshold: Log2 fold change threshold for control conditions
    - current_target: The current target antigen for this iteration
    - sequenced_library_enabled: Use the selected sequenced library sample's condition as base condition for enrichment
    - sequenced_library_sample_id: Sample ID of the sequenced library (used as base condition when enabled)
    """
    # Read data with polars lazy evaluation
    # Force condition to be string to avoid type errors during comparison
    input_df = pl.scan_csv(input_data_csv, schema_overrides={"condition": pl.Utf8})
    schema = input_df.collect_schema()

    # Normalize condition order and resolve sequenced library as base condition
    condition_order = [str(cond) for cond in condition_order]
    if present_in_rounds:
        present_in_rounds = [str(cond) for cond in present_in_rounds]
    library_condition: Optional[str] = None
    if sequenced_library_enabled and sequenced_library_sample_id:
        sample_cond = (
            input_df.filter(pl.col("sampleId") == sequenced_library_sample_id)
            .select("condition")
            .unique()
            .collect()
        )
        if sample_cond.height > 0:
            raw = sample_cond["condition"][0]
            # library_condition = "Library sample" if raw is None or str(raw).strip() == "" else str(raw)
            # To make exports easier we will always rename for now
            library_condition = "0 - Library"
            
            # If there are rows where condition is already "Library", rename them to "Library_" to avoid collision
            input_df = input_df.with_columns(
                pl.when(pl.col("condition") == "0 - Library")
                .then(pl.lit("Library_"))
                .otherwise(pl.col("condition"))
                .alias("condition")
            )
            
            # Rename to "Library" if empty, or if another sample has the same condition (to disambiguate)
            need_rename = library_condition == "0 - Library"
            if not need_rename:
                other_with_same_condition = (
                    input_df.filter(
                        (pl.col("condition") == raw) & (pl.col("sampleId") != sequenced_library_sample_id)
                    )
                    .select("sampleId")
                    .unique()
                    .collect()
                )
                if other_with_same_condition.height > 0:
                    need_rename = True
                    library_condition = "0 - Library"
            if need_rename:
                input_df = input_df.with_columns(
                    pl.when(pl.col("sampleId") == sequenced_library_sample_id)
                    .then(pl.lit("0 - Library"))
                    .otherwise(pl.col("condition"))
                    .alias("condition")
                )

    effective_condition_order: List[str] = (
        [library_condition] + [c for c in condition_order if c != library_condition]
        if library_condition is not None
        else condition_order
    )

    # Check if input data is empty (no clonotypes)
    ## Check if there are any non-null, non-empty elementId value in lazy frame
    element_count = input_df.filter(
        pl.col('elementId').is_not_null() & 
        (pl.col('elementId') != "")
    ).select(pl.len()).collect().item()
    if element_count == 0:
        # Create empty outputs and exit (use effective order so schema matches non-empty case)
        create_empty_outputs(effective_condition_order, enrichment_csv, bubble_csv,
                                top_enriched_csv, top_10_csv, highest_enrichment_csv,
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
            col for col in input_df.collect_schema().names() if col.startswith('clonotypeDefinition_')]

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

    # Rename and validate columns
    if "abundance" in input_df.collect_schema().names():
        input_df = input_df.drop("abundance")
    input_df = input_df.rename({"downsampledAbundance": "abundance"})

    # Validate expected columns - collect only schema to avoid loading full data
    expected_cols = {'sampleId', 'elementId', 'abundance', 'condition'}
    missing_cols = expected_cols - set(schema.names())
    if missing_cols:
        raise ValueError(
            f"Missing expected columns: {', '.join(missing_cols)}")

    # Select only needed columns to reduce memory and ensure condition is string type
    needed_cols = ['sampleId', 'elementId', 'abundance', 'condition']
    has_antigen = "antigen" in input_df.collect_schema().names()
    if has_antigen:
        needed_cols.append("antigen")
    
    input_df = input_df.select(needed_cols).with_columns(
        pl.col('condition').cast(pl.Utf8))

    # Calculate total reads per condition and antigen if applicable
    group_total_reads = ['condition']
    if has_antigen:
        group_total_reads.append('antigen')

    total_reads_df = (
        input_df
        .group_by(group_total_reads)
        .agg(pl.col('abundance').sum().alias('total_reads'))
        .collect()
    )

    # Create aggregated data first, then pivot (pivot requires DataFrame, not LazyFrame)
    # We need to keep sampleId and antigen if we want to use them in filtering
    group_cols = ['sampleId', 'elementId', 'condition']
    if has_antigen:
        group_cols.append("antigen")

    aggregated_df = (
        input_df
        .group_by(group_cols)
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

    # --- Target Track Processing ---
    # Get total reads for target track frequencies and filtering and define target_track_df
    if has_antigen and current_target:
        target_reads = total_reads_df.filter(pl.col('antigen') == current_target)
        target_total_reads_dict = dict(zip(target_reads['condition'], target_reads['total_reads']))
        # When sequenced library is enabled, include the library sample
        if sequenced_library_sample_id is not None:
            library_sample_reads = aggregated_df.filter(
                pl.col('sampleId') == sequenced_library_sample_id
            ).select(pl.col('abundance').sum()).to_series().item()
            target_total_reads_dict[library_condition] = library_sample_reads
            target_track_df = aggregated_df.filter(
                (pl.col('antigen') == current_target) | (pl.col('sampleId') == sequenced_library_sample_id)
            )
        else:
            target_track_df = aggregated_df.filter(pl.col('antigen') == current_target)
    else:
        # Fallback to global totals if no antigen or control disabled
        global_reads = total_reads_df.group_by('condition').agg(pl.col('total_reads').sum())
        target_total_reads_dict = dict(zip(global_reads['condition'], global_reads['total_reads']))
        target_track_df = aggregated_df

    # Calculate track-specific n_clonotypes for normalization
    target_n_clonotypes = target_track_df.select('elementId').n_unique()

    # Apply clonotype filtering if requested on the target track
    if filter_clonotypes:
        target_track_df = filter_clonotypes_by_criteria(
            target_track_df, effective_condition_order,
            filter_single_sample, filter_any_zero, min_abundance,
            min_frequency, target_total_reads_dict,
            present_in_rounds, present_in_rounds_logic,
            pseudo_count, target_n_clonotypes
        )

    # After filtering, aggregate away sampleId and antigen for the pivot
    target_track_pivot_ready = (
        target_track_df
        .group_by(['elementId', 'condition'])
        .agg(pl.col('abundance').sum().alias('abundance'))
    )

    # Check if we have too few clonotypes after filtering
    if filtered_too_much_txt:
        unique_clonotypes_count = target_track_pivot_ready.select('elementId').n_unique()
        too_few = "true" if (unique_clonotypes_count < 1) else "false"
        with open(filtered_too_much_txt, 'w') as f:
            f.write(too_few)

    # Create pivot table for target track
    pivot_df = (
        target_track_pivot_ready
        .pivot(values='abundance', index='elementId', on='condition', aggregate_function='sum')
        .fill_null(0)
    )

    # Ensure all conditions are present in pivot
    pivot_df_schema = pivot_df.collect_schema().names()
    for condition in effective_condition_order:
        if condition not in pivot_df_schema:
            pivot_df = pivot_df.with_columns(pl.lit(0).alias(condition))
    pivot_df_schema = pivot_df.collect_schema().names()

    # Convert elementId to index by setting it aside
    pivot_df = pivot_df.sort('elementId')

    # Sort columns alphabetically but keep elementId
    condition_cols = sorted([col for col in pivot_df_schema if col != 'elementId'])
    pivot_df = pivot_df.select(['elementId'] + condition_cols)

    # Pre-calculate frequencies for target track
    freq_expressions = []
    for condition in effective_condition_order:
        total = target_total_reads_dict.get(condition, 1)
        # This ensures frequencies sum to 1: Σ[(abundance + p) / (total + N*p)] = 1
        freq_expressions.append(
            ((pl.col(condition) + pseudo_count) / (total + (target_n_clonotypes * pseudo_count))).alias(f'freq_{condition}')
        )

    # Add frequency columns
    pivot_df = pivot_df.with_columns(freq_expressions)

    # Calculate Overall Log2FC (last vs first)
    if len(effective_condition_order) >= 2:
        first_cond = effective_condition_order[0]
        last_cond = effective_condition_order[-1]
        
        # Formula: log2((last_freq) / (first_freq))
        # Since freq_last = (abundance_last + p) / (total_last + N*p)
        # This matches the pairwise enrichment logic
        overall_expr = (
            pl.when((pl.col(f'freq_{last_cond}') > 0) & (pl.col(f'freq_{first_cond}') > 0))
            .then((pl.col(f'freq_{last_cond}') / pl.col(f'freq_{first_cond}')).log(2))
            .otherwise(None)
            .alias('Overall Log2FC')
        )
        pivot_df = pivot_df.with_columns(overall_expr)

    # Calculate pairwise enrichments
    enrichment_results = _calculate_enrichments_vectorized(
        pivot_df, effective_condition_order
    )

    # --- Negative Control Track Processing ---
    neg_control_columns: List[str] = []
    max_neg_enrichment_df = None
    if has_antigen and control_enabled and negative_antigens:
        # Filter for all negative antigens; when sequenced library is enabled, include library sample too
        neg_track_df = aggregated_df.filter(
            pl.col('antigen').is_in(negative_antigens) 
            | ((sequenced_library_sample_id is not None) & (pl.col('sampleId') == sequenced_library_sample_id))
        )

        # Use control-specific order if provided, otherwise fallback to effective (target) order
        base_order = control_conditions_order if control_conditions_order is not None else effective_condition_order
        # When sequenced library is enabled, put library condition first as base for controls too
        if library_condition is not None:
            base_order = [library_condition] + [c for c in base_order if c != library_condition]
        
        if neg_track_df.height > 0:
            # We need to calculate enrichment independently for each negative 
            # antigen (only the ones which where provided and are present in the data)
            unique_neg_antigens = (
                neg_track_df.filter(pl.col('antigen').is_in(negative_antigens))
                .select('antigen').unique().to_series().to_list()
            )
            neg_enrichments_max: List[pl.DataFrame] = []   # multi-condition: elementId + MaxPositiveEnrichment
            neg_enrichments_present: List[pl.DataFrame] = []  # single-condition: elementId + PresentInNegControl

            for neg_antigen in unique_neg_antigens:
                # Include library sample in each negative antigen's track when sequenced library is enabled
                antigen_df = neg_track_df.filter(
                    (pl.col('antigen') == neg_antigen) | 
                    (sequenced_library_enabled & (sequenced_library_sample_id is not None) & (pl.col('sampleId') == sequenced_library_sample_id))
                )

                # Pivot for this specific negative antigen
                antigen_pivot = (
                    antigen_df
                    .group_by(['elementId', 'condition'])
                    .agg(pl.col('abundance').sum().alias('abundance'))
                    .pivot(values='abundance', index='elementId', on='condition', aggregate_function='sum')
                    .fill_null(0)
                )

                # Only use conditions that are actually present for this antigen
                # to avoid spurious enrichments from missing/synthetic conditions
                pivot_names = antigen_pivot.collect_schema().names()
                available_conditions = [c for c in base_order if c in pivot_names]
                # If the antigen has one experimental condition not in base_order, use it as a fallback
                experimental_pivot = [c for c in pivot_names if c not in ('elementId', library_condition)]
                if len(experimental_pivot) == 1 and experimental_pivot[0] not in available_conditions:
                    available_conditions = ([library_condition] if library_condition in pivot_names else []) + experimental_pivot

                antigen_pivot = antigen_pivot.sort('elementId')
                # Keep elementId in the selection
                antigen_pivot = antigen_pivot.select(['elementId'] + available_conditions)

                # Get total reads for this negative antigen; include library condition counts when library is enabled
                neg_reads = total_reads_df.filter(
                    (pl.col('antigen') == neg_antigen) | 
                    ((library_condition is not None) & (pl.col('condition') == library_condition))
                )
                neg_total_reads_dict = dict(zip(neg_reads['condition'], neg_reads['total_reads']))
                
                # Calculate track-specific n_clonotypes for this negative antigen
                neg_n_clonotypes = antigen_df.select('elementId').n_unique()

                if len(available_conditions) > 1:
                    # Multiple conditions: compute frequencies and enrichments
                    neg_freq_exprs = []
                    for condition in available_conditions:
                        total = neg_total_reads_dict.get(condition, 1)
                        neg_freq_exprs.append(
                            ((pl.col(condition) + pseudo_count) / (total + (neg_n_clonotypes * pseudo_count))).alias(f'freq_{condition}')
                        )
                    antigen_pivot = antigen_pivot.with_columns(neg_freq_exprs)
                    antigen_enrichment = _calculate_enrichments_vectorized(
                        antigen_pivot, available_conditions
                    )
                    # If no pairwise comparisons were possible, create a 0-filled max column
                    if 'MaxPositiveEnrichment' not in antigen_enrichment.collect_schema().names():
                        antigen_enrichment = antigen_enrichment.with_columns(
                            pl.lit(0.0).alias('MaxPositiveEnrichment')
                        )
                    # Store new columns
                    antigen_max = antigen_enrichment.select(['elementId', 'MaxPositiveEnrichment'])
                    neg_enrichments_max.append(antigen_max)
                elif len(available_conditions) == 1:
                    # Single condition: calculate FC against target last condition
                    cond = available_conditions[0]
                    
                    # Calculate frequency in control
                    total = neg_total_reads_dict.get(cond, 1)
                    freq_expr = (pl.col(cond) + pseudo_count) / (total + (neg_n_clonotypes * pseudo_count))
                    
                    antigen_pivot = antigen_pivot.with_columns(
                        freq_expr.alias('_freq_control')
                    )
                    
                    # Get target frequency from enrichment_results
                    if enrichment_results.height == 0:
                        # If no target results, we can't calculate FC.
                        # Fallback: flag if frequency in control is high
                        present_df = antigen_pivot.filter(
                            pl.col('_freq_control') >= single_control_frequency_threshold
                        ).select(pl.col('elementId')).with_columns(
                            pl.lit(True).alias('PresentInNegControl')
                        )

                    else:
                        target_last_cond = effective_condition_order[-1]
                        target_freq_col = f'Frequency {target_last_cond}'
                        
                        # Join to get target frequency
                        # We use left join on antigen_pivot to keep all control clonotypes
                        antigen_pivot = antigen_pivot.join(
                            enrichment_results.select(['elementId', target_freq_col]),
                            on='elementId',
                            how='left'
                        )
                        
                        # Calculate Fold Change: Target / Control
                        # Handle nulls (not in target) as 0 frequency
                        antigen_pivot = antigen_pivot.with_columns(
                            pl.col(target_freq_col).fill_null(0.0).alias('_freq_target')
                        )
                        
                        # FC = Target / Control
                        antigen_pivot = antigen_pivot.with_columns(
                            (pl.col('_freq_target') / pl.col('_freq_control')).alias('_fc_target_control')
                        )
                        
                        # Filter logic:
                        # We keep (don't flag as PresentInNegControl) if:
                        # 1. FC >= threshold (Specific enrichment in target)
                        # 2. AND Frequency in control < threshold (Low abundance in control)
                        present_df = antigen_pivot.filter(
                            (pl.col('_fc_target_control') < single_control_fc_threshold) |
                            (pl.col('_freq_control') >= single_control_frequency_threshold)
                        ).select(pl.col('elementId')).with_columns(
                            pl.lit(True).alias('PresentInNegControl')
                        )
                        
                        
                    neg_enrichments_present.append(present_df)                    

            # Combine per-antigen results into one table; track which columns we produced
            if neg_enrichments_max:
                max_neg_enrichment_df = (
                    pl.concat(neg_enrichments_max)
                    .group_by('elementId')
                    .agg(pl.col('MaxPositiveEnrichment').max().alias('MaxNegControlEnrichment'))
                )
                neg_control_columns.append('MaxNegControlEnrichment')
            if neg_enrichments_present:
                present_df = (
                    pl.concat(neg_enrichments_present)
                    .group_by('elementId')
                    .agg(pl.col('PresentInNegControl').any().alias('PresentInNegControl'))
                )
                if max_neg_enrichment_df is not None:
                    max_neg_enrichment_df = max_neg_enrichment_df.join(present_df, on='elementId', how='outer')
                    
                    # Coalesce elementId columns if they split during outer join
                    if 'elementId_right' in max_neg_enrichment_df.columns:
                        max_neg_enrichment_df = max_neg_enrichment_df.with_columns(
                            pl.coalesce([pl.col('elementId'), pl.col('elementId_right')]).alias('elementId')
                        ).drop('elementId_right')
                else:
                    max_neg_enrichment_df = present_df
                neg_control_columns.append('PresentInNegControl')

    # Join negative control columns if calculated (right after control processing)
    if max_neg_enrichment_df is not None:
        enrichment_results = enrichment_results.join(
            max_neg_enrichment_df, on='elementId', how='left'
        )
        if 'MaxNegControlEnrichment' in neg_control_columns:
            enrichment_results = enrichment_results.with_columns(
                pl.col('MaxNegControlEnrichment').fill_null(0)
            )
        if 'PresentInNegControl' in neg_control_columns:
            enrichment_results = enrichment_results.with_columns(
                pl.col('PresentInNegControl').fill_null(False)
            )
    elif control_enabled:
        # If control enabled but no neg data found, add default columns for backward compatibility
        enrichment_results = enrichment_results.with_columns(
            pl.lit(0.0).alias('MaxNegControlEnrichment'),
            pl.lit(False).alias('PresentInNegControl'),
        )

    # Join with Overall Log2FC if it was calculated
    if 'Overall Log2FC' in pivot_df.collect_schema().names():
        enrichment_results = enrichment_results.join(
            pivot_df.select(['elementId', 'Overall Log2FC']),
            on='elementId',
            how='left'
        )

    # Calculate Binding Specificity if control is enabled
    if control_enabled:
        target_expr = pl.col('MaxPositiveEnrichment')
        # Antigen-specific when target enriched and not enriched/present in negative control
        not_in_control_expr = pl.lit(True)
        if 'MaxNegControlEnrichment' in neg_control_columns:
            not_in_control_expr = not_in_control_expr & (pl.col('MaxNegControlEnrichment') < control_threshold)
        if 'PresentInNegControl' in neg_control_columns:
            not_in_control_expr = not_in_control_expr & (~pl.col('PresentInNegControl'))
        # Present/enriched in control
        in_control_expr = pl.lit(False)
        if 'MaxNegControlEnrichment' in neg_control_columns:
            in_control_expr = in_control_expr | (pl.col('MaxNegControlEnrichment') >= control_threshold)
        if 'PresentInNegControl' in neg_control_columns:
            in_control_expr = in_control_expr | pl.col('PresentInNegControl')

        enrichment_results = enrichment_results.with_columns(
            pl.when((target_expr >= enrichment_threshold) & not_in_control_expr)
            .then(pl.lit("Antigen-Specific"))
            .when((target_expr >= enrichment_threshold) & in_control_expr)
            .then(pl.lit("Non-Specific"))
            .when((target_expr < enrichment_threshold) & in_control_expr)
            .then(pl.lit("Negative-Control"))
            .otherwise(pl.lit("Not-Enriched"))
            .alias('Binding Specificity')
        )

    # Calculate Enrichment Quality
    if enrichment_results.height > 0:
        # Max frequency across all conditions for each clonotype
        freq_cols = [f'Frequency {c}' for c in effective_condition_order]
        
        # Generate max frequency column
        enrichment_results = enrichment_results.with_columns(
            pl.concat_list(freq_cols).list.max().alias('_max_freq')
        )
        
        # Calculate thresholds (percentiles) from the current data
        # Handle cases where columns might have nulls by using fill_null(0) for percentile calculation if needed
        high_threshold = max(enrichment_threshold, enrichment_results.select(pl.col('MaxPositiveEnrichment').fill_null(0).quantile(0.75)).item())
        stable_threshold = max(enrichment_threshold, enrichment_results.select(pl.col('Overall Log2FC').fill_null(0).quantile(0.50)).item())
        low_threshold = enrichment_results.select(pl.col('MaxPositiveEnrichment').fill_null(0).quantile(0.25)).item()
        freq_threshold = enrichment_results.select(pl.col('_max_freq').fill_null(0).quantile(0.75)).item()
        
        enrichment_results = enrichment_results.with_columns(
            pl.when((pl.col('MaxPositiveEnrichment') >= high_threshold) & (pl.col('Overall Log2FC') >= stable_threshold))
            .then(pl.lit("Stable Binder"))
            .when((pl.col('MaxPositiveEnrichment') >= high_threshold) & (pl.col('Overall Log2FC') < stable_threshold))
            .then(pl.lit("Rescuer"))
            .when((pl.col('MaxPositiveEnrichment') < low_threshold) & (pl.col('_max_freq') >= freq_threshold))
            .then(pl.lit("Parasite"))
            .otherwise(pl.lit("Weak Binder"))
            .alias('EnrichmentQuality')
        )
        if control_enabled:
            enrichment_results = enrichment_results.with_columns(
                pl.when(pl.col('Binding Specificity').is_in(['Negative-Control', 'Not-Enriched']))
                .then(pl.lit("Non Binder").cast(pl.Utf8))
                .otherwise(pl.col('EnrichmentQuality'))
                .alias('EnrichmentQuality')
            )
    else:
        # For empty dataframe, add the column with correct type
        enrichment_results = enrichment_results.with_columns(
            pl.lit(None).cast(pl.Utf8).alias('EnrichmentQuality')
        )

    # Apply label mapping
    enrichment_results = enrichment_results.join(
        label_mapping, on='elementId', how='left')

    # Reorder columns: elementId, Label, then others
    cols_to_front = ['elementId', 'Label']
    other_cols = [col for col in enrichment_results.collect_schema().names() if col not in cols_to_front]
    enrichment_results = enrichment_results.select(cols_to_front + other_cols)

    # Sort table by elementId
    enrichment_results = enrichment_results.sort('elementId')

    # Save main enrichment results
    enrichment_results.write_csv(enrichment_csv)

    # Process outputs efficiently
    _process_outputs(
        enrichment_results, effective_condition_order, bubble_csv, top_enriched_csv,
        top_10_csv, highest_enrichment_csv, top_n_bubble, top_n_enriched, min_enrichment
    )


def _calculate_enrichments_vectorized(
    pivot_df: pl.DataFrame,
    condition_order: List[str]
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

    # Select only needed columns
    freq_col_names = [
        f'Frequency {condition}' for condition in condition_order]
    result_cols = freq_col_names + enrichment_col_names
    if enrichment_col_names:  # Only add MaxPositiveEnrichment if we have enrichment columns
        result_cols.append('MaxPositiveEnrichment')
    
    # Safely include elementId if it exists in the input
    if 'elementId' in result_df.collect_schema().names():
        result_cols = ['elementId'] + result_cols
        
    return result_df.select(result_cols)


def _process_outputs(
    enrichment_results: pl.DataFrame,
    condition_order: List[str],
    bubble_csv: str,
    top_enriched_csv: str,
    top_10_csv: Optional[str],
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
        col for col in enrichment_results.collect_schema().names() if col.startswith('Enrichment ')]

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
            enrichment_results, top_n_bubble, min_enrichment
        )
        bubble_data.write_csv(bubble_csv)

        # Process top enriched data
        top_enriched_data = _create_top_enriched_data(
            enrichment_results, condition_order, min_enrichment, top_n_enriched
        )
        top_enriched_data.write_csv(top_enriched_csv)

        # Process top 20 data if requested
        if top_10_csv:
            top_10_data = _create_top_enriched_data(
                enrichment_results, condition_order, min_enrichment, 10
            )
            top_10_data.write_csv(top_10_csv)
    else:
        # Create empty outputs if no enrichment columns
        
        # Bubble needs specific columns
        bubble_cols = [
            'elementId', 'Label', 'Numerator', 'Denominator', 'Enrichment', 
            'Frequency_Numerator', 'MaxPositiveEnrichment', 
            'Binding Specificity', 'MaxNegControlEnrichment', 'PresentInNegControl', 'EnrichmentQuality'
        ]
        pl.DataFrame(schema=bubble_cols).write_csv(bubble_csv)

        # Top enriched needs specific columns
        top_enriched_cols = [
            'elementId', 'Label', 'Condition', 'Frequency',
            'Binding Specificity', 'MaxNegControlEnrichment', 'PresentInNegControl',
            'EnrichmentQuality'
        ]
        pl.DataFrame(schema=top_enriched_cols).write_csv(top_enriched_csv)
        
        if top_10_csv:
            pl.DataFrame(schema=top_enriched_cols).write_csv(top_10_csv)
            
        if highest_enrichment_csv:
            highest_cols = [
                'elementId', 'Label', 'Comparison', 'Numerator',
                'Denominator', 'Enrichment', 'Frequency_Numerator',
                'Overall Log2FC', 'MaxPositiveEnrichment', 
                'MaxNegControlEnrichment', 'PresentInNegControl', 'Binding Specificity', 'EnrichmentQuality'
            ]
            pl.DataFrame(schema=highest_cols).write_csv(highest_enrichment_csv)


def _create_detailed_enrichment_table(
    enrichment_results: pl.DataFrame,
    enrichment_cols: List[str],
    condition_order: List[str]
) -> pl.DataFrame:
    """
    Create detailed enrichment table efficiently using polars operations.
    """
    # Identify additional columns to preserve
    extra_cols = []
    for col in ['Overall Log2FC', 'Binding Specificity', 'EnrichmentQuality', 'MaxNegControlEnrichment', 'PresentInNegControl']:
        if col in enrichment_results.columns:
            extra_cols.append(col)

    # Melt enrichment data
    id_vars = ['elementId', 'Label'] + extra_cols
    enrichment_melted = (
        enrichment_results
        .select(id_vars + enrichment_cols)
        .melt(
            id_vars=id_vars,
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
    ] + extra_cols).rename({'comparison_clean': 'Comparison'})

    return result


def _create_bubble_data(
    enrichment_results: pl.DataFrame,
    top_n_bubble: int,
    min_enrichment: float
) -> pl.DataFrame:
    """
    Create bubble plot data efficiently.
    """
    # Filter by minimum enrichment
    max_col = 'MaxPositiveEnrichment'
    
    filtered_data = enrichment_results.filter(
        pl.col(max_col) >= min_enrichment
    )

    if filtered_data.height == 0:
        schema = {
            'elementId': pl.Utf8, 'Label': pl.Utf8, 'Numerator': pl.Utf8,
            'Denominator': pl.Utf8, 'Enrichment': pl.Float64,
            'Frequency_Numerator': pl.Float64, max_col: pl.Float64
        }
        return pl.DataFrame(schema=schema)

    # Get top clonotypes
    top_clonotypes = (
        filtered_data
        .sort([max_col, 'elementId'], descending=[True, False])
        .head(top_n_bubble)
        .select('elementId')
    )

    # Filter data for top clonotypes
    bubble_data = filtered_data.join(
        top_clonotypes, on='elementId', how='inner')

    # Create bubble data efficiently
    enrichment_cols = [
        col for col in bubble_data.collect_schema().names() if col.startswith('Enrichment ')]
    
    # Identify extra columns to include
    extra_cols = []
    for col in ['Binding Specificity', 'MaxNegControlEnrichment', 'PresentInNegControl', 'EnrichmentQuality']:
        if col in bubble_data.columns:
            extra_cols.append(col)
            
    bubble_rows = []

    for row in bubble_data.iter_rows(named=True):
        element_id = row['elementId']
        label = row['Label']
        max_val = row[max_col]
        
        # Prepare extra data
        extra_data = {col: row[col] for col in extra_cols}

        for col in enrichment_cols:
            enrich_val = row[col]
            if enrich_val is not None and enrich_val > 0:
                # Parse comparison
                comparison = col.replace('Enrichment ', '')
                numerator, denominator = comparison.split(' vs ')
                freq_val = row.get(f'Frequency {numerator}', None)

                row_data = {
                    'elementId': element_id,
                    'Label': label,
                    'Numerator': numerator,
                    'Denominator': denominator,
                    'Enrichment': enrich_val,
                    'Frequency_Numerator': freq_val,
                    max_col: max_val
                }
                row_data.update(extra_data)
                bubble_rows.append(row_data)

    if bubble_rows:
        return pl.DataFrame(bubble_rows)
    else:
        schema = {
            'elementId': pl.Utf8, 'Label': pl.Utf8, 'Numerator': pl.Utf8,
            'Denominator': pl.Utf8, 'Enrichment': pl.Float64,
            'Frequency_Numerator': pl.Float64, 'MaxPositiveEnrichment': pl.Float64,
            'Binding Specificity': pl.Utf8, 'MaxNegControlEnrichment': pl.Float64, 'PresentInNegControl': pl.Boolean,
            'EnrichmentQuality': pl.Utf8
        }
        return pl.DataFrame(schema=schema)


def _create_top_enriched_data(
    enrichment_results: pl.DataFrame,
    condition_order: List[str],
    min_enrichment: float,
    top_n: int
) -> pl.DataFrame:
    """
    Create top enriched frequency data efficiently.
    """
    max_col = 'MaxPositiveEnrichment'

    # Filter by min_enrichment first
    filtered_results = enrichment_results.filter(
        pl.col(max_col) >= min_enrichment
    )

    if filtered_results.height == 0:
        return pl.DataFrame(schema={
            'elementId': pl.Utf8, 'Label': pl.Utf8, 'Condition': pl.Utf8, 'Frequency': pl.Float64
        })

    # Get top element IDs
    top_ids = (
        filtered_results
        .sort([max_col, 'elementId'], descending=[True, False])
        .head(top_n)
        .select('elementId')
    )

    # Identify additional columns to preserve
    extra_cols = []
    for col in ['Binding Specificity', 'EnrichmentQuality', 'MaxNegControlEnrichment', 'PresentInNegControl']:
        if col in enrichment_results.columns:
            extra_cols.append(col)

    # Create frequency data
    freq_cols = [f'Frequency {cond}' for cond in condition_order]
    freq_data = (
        enrichment_results
        .join(top_ids, on='elementId', how='inner')
        .select(['elementId', 'Label'] + extra_cols + freq_cols)
        .melt(
            id_vars=['elementId', 'Label'] + extra_cols,
            value_vars=freq_cols,
            variable_name='ConditionFull',
            value_name='Frequency'
        )
        .with_columns(
            pl.col('ConditionFull').str.replace(
                'Frequency ', '').alias('Condition')
        )
        .select(['elementId', 'Label', 'Condition', 'Frequency'] + extra_cols)
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
    parser.add_argument("--top_10", required=False)
    parser.add_argument("--highest_enrichment_clonotype", required=False,
                        help="Optional CSV output for rows with the highest enrichment per elementId-Label combination.")
    parser.add_argument("--top_n_bubble", type=int, default=10)
    parser.add_argument("--top_n_enriched", type=int, default=10)
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
    parser.add_argument("--control_enabled", action="store_true",
                        help="Enable negative control specificity filtering")
    parser.add_argument("--negative_antigens", type=str, required=False,
                        help="JSON list of negative antigen names")
    parser.add_argument("--control_conditions_order", type=str, required=False,
                        help="JSON list of conditions where negative antigens are present")
    parser.add_argument("--enrichment_threshold", type=float, default=2.0,
                        help="Log2 fold change threshold for target conditions")
    parser.add_argument("--control_threshold", type=float, default=1.0,
                        help="Log2 fold change threshold for control conditions")
    parser.add_argument("--single_control_fc_threshold", type=float, default=10.0,
                        help="Fold change threshold for single condition negative control filtering")
    parser.add_argument("--single_control_frequency_threshold", type=float, default=0.01,
                        help="Frequency threshold for single condition negative control filtering")
    parser.add_argument("--current_target", type=str, required=False,
                        help="The current target antigen for this iteration")
    parser.add_argument("--sequenced_library_enabled", action="store_true",
                        help="Enable usage of the selected sequenced library sample's condition as base condition for enrichment")
    parser.add_argument("--sequenced_library_sample_id", type=str, required=False,
                        help="Sample ID of the sequenced library (used as base condition when enabled)")

    args = parser.parse_args()

    hybrid_enrichment_analysis(
        input_data_csv=args.input_data,
        condition_order=json.loads(args.conditions),
        enrichment_csv=args.enrichment,
        bubble_csv=args.bubble,
        top_enriched_csv=args.top_enriched,
        top_10_csv=args.top_10,
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
        pseudo_count=args.pseudo_count,
        control_enabled=args.control_enabled,
        negative_antigens=json.loads(args.negative_antigens) if args.negative_antigens else None,
        control_conditions_order=json.loads(args.control_conditions_order) if args.control_conditions_order else None,
        enrichment_threshold=args.enrichment_threshold,
        control_threshold=args.control_threshold,
        single_control_fc_threshold=args.single_control_fc_threshold,
        single_control_frequency_threshold=args.single_control_frequency_threshold,
        current_target=args.current_target,
        sequenced_library_enabled=args.sequenced_library_enabled,
        sequenced_library_sample_id=args.sequenced_library_sample_id
    )
