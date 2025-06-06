import pandas as pd
import numpy as np
import json

def hybrid_enrichment_analysis(
    input_data_csv,
    condition_order,
    enrichment_csv,
    bubble_csv,
    top_enriched_csv,
    top_20_csv=None,
    highest_enrichment_csv=None,
    use_penalty=True,
    penalty_enrich=2,
    penalty_deplete=10,
    top_n_bubble=20,
    top_n_enriched=5,
    min_enrichment=3
):
    input_df = pd.read_csv(input_data_csv)

    # Rename downsampledAbundance to abundance and run the enrichment with it
    input_df['abundance'] = input_df['downsampledAbundance'] 
    input_df.drop(columns=['downsampledAbundance'], inplace=True)

    # Validate expected columns
    expected_fixed_cols = {'sampleId', 'elementId', 'abundance', 'condition'}
    if not expected_fixed_cols.issubset(input_df.columns):
        missing = expected_fixed_cols - set(input_df.columns)
        raise ValueError(f"Missing expected columns in combined data CSV: {', '.join(missing)}")

    total_reads = input_df.groupby('condition')['abundance'].sum().to_dict()
    pivot_df = input_df.groupby(['elementId', 'condition'])['abundance'].sum().unstack(fill_value=0)

    for condition in condition_order:
        if condition not in pivot_df.columns:
            pivot_df[condition] = 0

    result_rows = []
    for elementId in pivot_df.index:
        freqs = {}
        # Calculate frequency for each condition first (handles pseudocounts/penalties)
        for cond in condition_order:
            total = total_reads.get(cond, 1)
            if total == 0: total = 1 # Avoid division by zero if a condition somehow has zero total reads
            abundance = pivot_df.at[elementId, cond]
            if abundance > 0:
                freqs[cond] = abundance / total
            else:
                # Apply pseudocount / penalty logic
                pseudocount_val = 1 / total # Base pseudocount
                if use_penalty:

                    # Reinstating original penalty logic structure for calculating freqs[cond] when abundance is 0:
                    min_nonzero_abundance_for_clono = pivot_df.loc[elementId].replace(0, np.nan).min()
                    if pd.isna(min_nonzero_abundance_for_clono):
                        min_nonzero_abundance_for_clono = 1 # Absolute minimum if clonotype is all zeros

                    if cond == condition_order[0]: # Reference for penalty type
                        freqs[cond] = min_nonzero_abundance_for_clono / (penalty_enrich * total)
                    else:
                        freqs[cond] = min_nonzero_abundance_for_clono / (penalty_deplete * total)
                else:
                    freqs[cond] = pseudocount_val # Use simple pseudocount if not using penalty

        all_pairwise_enrichments = {}
        for num_i in range(1, len(condition_order)):      # Numerator index
            for den_j in range(num_i):                     # Denominator index (j < i)
                numerator = condition_order[num_i]
                denominator = condition_order[den_j]
                
                freq_num = freqs[numerator]
                freq_den = freqs[denominator]
                enrichment_val = np.log2(freq_num / freq_den)
                
                # Handle -np.inf resulting from log2(small_number/large_number) if freq_num was from penalty
                if enrichment_val == -np.inf and freq_num > 0 and freq_den > 0:
                    enrichment_val = np.log2(freq_num / freq_den) # Re-evaluate if both were positive

                all_pairwise_enrichments[f'Enrichment {numerator} vs {denominator}'] = enrichment_val
        
        row = {'elementId': elementId}
        for cond in condition_order:
            row[f'Frequency {cond}'] = freqs[cond]
        row.update(all_pairwise_enrichments)
        result_rows.append(row)

    result_df = pd.DataFrame(result_rows)

    elementId_labels = {
        elementId: f"C{i+1}"
        for i, elementId in enumerate(result_df["elementId"])
    }

    result_df["Label"] = result_df["elementId"].map(elementId_labels)
    result_df = result_df[["elementId", "Label"] + [col for col in result_df.columns if col not in ["elementId", "Label"]]]

    freq_cols = [f"Frequency {cond}" for cond in condition_order]
    enrich_cols = [col for col in result_df.columns if col.startswith("Enrichment ")]

    # Prepare data for enrichment.csv
    # It should list all calculated pairwise enrichments with their numerator frequency.
    # Columns: elementId, Label, Numerator, Denominator, Enrichment, Frequency_Numerator
    if not result_df.empty and enrich_cols:
        enrich_raw_long = result_df.melt(
            id_vars=["elementId", "Label"],
            value_vars=enrich_cols,
            var_name="Comparison",
            value_name="Enrichment"
        ).dropna(subset=["Enrichment"]) # Remove rows where enrichment couldn't be calculated (NaN)

        comparison_parts = enrich_raw_long["Comparison"].str.replace("Enrichment ", "").str.split(" vs ", n=1, expand=True)
        enrich_raw_long["Numerator"] = comparison_parts[0]
        enrich_raw_long["Denominator"] = comparison_parts[1]

        freq_long_for_merge = result_df.melt(
            id_vars=["elementId", "Label"],
            value_vars=freq_cols,
            var_name="ConditionFull",
            value_name="Frequency_Numerator"
        )
        freq_long_for_merge["Numerator"] = freq_long_for_merge["ConditionFull"].str.replace("Frequency ", "")
        
        enrichment_df_final = pd.merge(
            enrich_raw_long,
            freq_long_for_merge[["elementId", "Label", "Numerator", "Frequency_Numerator"]],
            on=["elementId", "Label", "Numerator"],
            how="left"
        )
        enrichment_df_final["Comparison"] = enrichment_df_final["Comparison"].str.replace("Enrichment ", "")
        enrichment_df_final = enrichment_df_final[[
            "elementId", "Label", "Comparison", "Numerator", "Denominator", "Enrichment", "Frequency_Numerator"
        ]]
    else: # result_df is empty or no enrich_cols (e.g. only one condition)
         enrichment_df_final = pd.DataFrame(columns=["elementId", "Label", "Comparison", "Numerator", "Denominator", "Enrichment", "Frequency_Numerator"])
    
    result_df.to_csv(enrichment_csv, index=False)

    if highest_enrichment_csv: # Check if the argument was provided
        if not enrichment_df_final.empty:
            df_for_max = enrichment_df_final.copy()
            # Ensure 'Enrichment' is numeric, coercing errors to NaN.
            # This handles potential strings like "inf", "-inf" if they exist, or other non-numeric values.
            df_for_max['Enrichment'] = pd.to_numeric(df_for_max['Enrichment'], errors='coerce')

            idx_list = []
            # Iterate through groups to safely apply idxmax only to groups with valid data
            # Use observed=True if your pandas version supports it and it's desired, otherwise, it can be omitted.
            for _, group in df_for_max.groupby(['elementId', 'Label'], observed=True):
                if group['Enrichment'].notna().any(): # Check if there's any non-NaN 'Enrichment' value in the group
                    idx_list.append(group['Enrichment'].idxmax()) # idxmax skips NaNs within this filtered group

            if idx_list: # If any valid indices were found
                # Select rows from the original enrichment_df_final to preserve original data types where possible,
                # using .loc with the collected valid indices.
                highest_enrichment_df = enrichment_df_final.loc[idx_list].reset_index(drop=True)
                highest_enrichment_df.to_csv(highest_enrichment_csv, index=False)
            else: # No groups had valid (non-NaN) enrichment values, or df_for_max was empty of relevant data
                # Create an empty CSV with the same columns as enrichment_df_final
                pd.DataFrame(columns=enrichment_df_final.columns).to_csv(highest_enrichment_csv, index=False)
        else: # enrichment_df_final was empty from the start
            pd.DataFrame(columns=enrichment_df_final.columns).to_csv(highest_enrichment_csv, index=False)

    # Bubble and top enriched
    bubble_rows = []
    if not result_df.empty and enrich_cols:
        # Calculate overall max positive enrichment for each clonotype
        # Create a temporary df with only positive enrichments, then find max. If all negative/NaN, max will be NaN.
        positive_enrich_cols = result_df[enrich_cols].clip(lower=0) 
        result_df["MaxPositiveEnrichment"] = positive_enrich_cols.max(axis=1)

        for _, row in result_df.iterrows():
            elementId_val = row["elementId"]
            label_val = row["Label"]
            clonotype_max_pos_enrich = row.get("MaxPositiveEnrichment", np.nan)

            if pd.isna(clonotype_max_pos_enrich) or clonotype_max_pos_enrich < min_enrichment:
                continue

            for num_idx in range(1, len(condition_order)):
                for den_idx in range(num_idx):
                    numerator = condition_order[num_idx]
                    denominator = condition_order[den_idx]
                    enrich_col_name = f"Enrichment {numerator} vs {denominator}"
                    
                    enrich_val = row.get(enrich_col_name)
                    
                    if pd.notnull(enrich_val) and enrich_val > 0: # Consider only positive enrichments for bubble points
                        freq_val = row.get(f"Frequency {numerator}", np.nan)
                        bubble_rows.append({
                            "elementId": elementId_val,
                            "Label": label_val,
                            "Numerator": numerator,
                            "Denominator": denominator,
                            "Enrichment": enrich_val,
                            "Frequency_Numerator": freq_val,
                            "MaxPositiveEnrichment": clonotype_max_pos_enrich
                        })
    bubbleColOrder = ["elementId", "Label", "Numerator", "Denominator", "Enrichment", 
                        "Frequency_Numerator", "MaxPositiveEnrichment"]
    if len(bubble_rows) > 0:
        bubble_df = pd.DataFrame(bubble_rows)
        bubble_df = bubble_df[bubbleColOrder]
    else:
        bubble_df = pd.DataFrame(columns=bubbleColOrder)

    if not bubble_df.empty:
        top_clonotypes_indices = (
            bubble_df.groupby("elementId")["MaxPositiveEnrichment"]
            .max()
            .sort_values(ascending=False)
            .head(top_n_bubble)
            .index
        )
        bubble_df_filtered = bubble_df[bubble_df["elementId"].isin(top_clonotypes_indices)]
    else:
        bubble_df_filtered = bubble_df.copy() # Empty df

    bubble_df_filtered.to_csv(bubble_csv, index=False)

    # Top enriched (frequencies only)
    # freq_long for top_enriched and top_20
    if not result_df.empty:
        general_freq_long = result_df.melt(
            id_vars=["elementId", "Label"],
            value_vars=freq_cols,
            var_name="ConditionFull",
            value_name="Frequency"
        )
        general_freq_long["Condition"] = general_freq_long["ConditionFull"].str.replace("Frequency ", "")
        general_freq_long = general_freq_long[["elementId", "Label", "Condition", "Frequency"]]
    else:
        general_freq_long = pd.DataFrame(columns=["elementId", "Label", "Condition", "Frequency"])

    if not bubble_df.empty: # Original bubble_df, not filtered one, for source of ranks
        top_enriched_ids = (
            bubble_df.groupby("elementId")["MaxPositiveEnrichment"]
            .max()
            .sort_values(ascending=False)
            .head(top_n_enriched)
            .index
        )
        top_enriched_freq = general_freq_long[general_freq_long["elementId"].isin(top_enriched_ids)]
    else:
        top_enriched_freq = pd.DataFrame(columns=general_freq_long.columns)
    top_enriched_freq.to_csv(top_enriched_csv, index=False)

    if top_20_csv:
        if not bubble_df.empty:
            top_20_ids = (
                bubble_df.groupby("elementId")["MaxPositiveEnrichment"]
                .max()
                .sort_values(ascending=False)
                .head(20)
                .index
            )
            top_20_freq = general_freq_long[general_freq_long["elementId"].isin(top_20_ids)]
        else:
            top_20_freq = pd.DataFrame(columns=general_freq_long.columns)
        top_20_freq.to_csv(top_20_csv, index=False)

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Hybrid Enrichment Analysis")
    parser.add_argument("--input_data", required=True, help="Path to the combined input CSV file. Expected columns: sampleId, elementId, abundance, downsampledAbundance, and condition.")
    parser.add_argument("--conditions", type=str, required=True)
    parser.add_argument("--enrichment", required=True)
    parser.add_argument("--bubble", required=True)
    parser.add_argument("--top_enriched", required=True)
    parser.add_argument("--top_20", required=False)
    parser.add_argument("--highest_enrichment_clonotype", required=False, help="Optional CSV output for rows with the highest enrichment per elementId-Label combination.")
    parser.add_argument("--use_penalty", action="store_true")
    parser.add_argument("--penalty_enrich", type=int, default=2)
    parser.add_argument("--penalty_deplete", type=int, default=10)
    parser.add_argument("--top_n_bubble", type=int, default=20)
    parser.add_argument("--top_n_enriched", type=int, default=5)
    parser.add_argument("--min_enrichment", required=False, type=float, default=0)

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
        min_enrichment=args.min_enrichment
    )
