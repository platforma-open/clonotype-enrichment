import pandas as pd
import numpy as np

def hybrid_enrichment_analysis(
    counts_csv,
    sample_metadata_csv,
    condition_column,
    condition_order,
    output_csv,
    volcano_csv,
    bubble_csv,
    use_penalty=True,
    penalty_enrich=2,
    penalty_deplete=10,
    top_n_volcano=1000,
    top_n_bubble=20
):
    # Load data
    counts_df = pd.read_csv(counts_csv)
    metadata_df = pd.read_csv(sample_metadata_csv)

    # Rename columns to match expected format
    counts_df = counts_df.rename(columns={
        "Clonotype key": "Clonotype",
        "Number Of Reads": "Count"
    })
    if condition_column not in metadata_df.columns:
        raise ValueError(f"'{condition_column}' not found in metadata CSV columns.")
    metadata_df = metadata_df.rename(columns={condition_column: "Condition"})

    # Merge on Sample
    merged_df = counts_df.merge(metadata_df, on='Sample')

    # Total reads per condition
    total_reads = merged_df.groupby('Condition')['Count'].sum().to_dict()

    # Pivot table of clonotype x condition counts
    pivot_df = merged_df.groupby(['Clonotype', 'Condition'])['Count'].sum().unstack(fill_value=0)

    # Ensure all conditions are present
    for condition in condition_order:
        if condition not in pivot_df.columns:
            pivot_df[condition] = 0

    # Calculate frequencies and enrichments
    result_rows = []
    for clonotype in pivot_df.index:
        freqs = {}
        enrichments = {}
        for cond in condition_order:
            total = total_reads.get(cond, 1)
            count = pivot_df.at[clonotype, cond]
            if count > 0:
                freqs[cond] = count / total
            else:
                pseudocount = 1 / total
                if use_penalty:
                    base_count = pivot_df.loc[clonotype].replace(0, np.nan).min()
                    if pd.isna(base_count):
                        base_count = 1
                    if cond == condition_order[0]:
                        freqs[cond] = base_count / (penalty_enrich * total)
                    else:
                        freqs[cond] = base_count / (penalty_deplete * total)
                else:
                    freqs[cond] = pseudocount

        baseline = freqs[condition_order[0]]
        for cond in condition_order[1:]:
            enrichments[f'Enrichment {cond} vs {condition_order[0]}'] = np.log2(freqs[cond] / baseline)

        row = {'Clonotype': clonotype}
        for cond in condition_order:
            row[f'Frequency {cond}'] = freqs[cond]
        row.update(enrichments)
        result_rows.append(row)

    result_df = pd.DataFrame(result_rows)

    # Add simplified consistent Clonotype labels
    clonotype_labels = {
        clonotype: f"Clonotype_{i+1}"
        for i, clonotype in enumerate(result_df["Clonotype"])
    }
    result_df["Label"] = result_df["Clonotype"].map(clonotype_labels)

    # Reorder columns: Label after Clonotype
    cols = result_df.columns.tolist()
    if "Label" in cols and "Clonotype" in cols:
        cols.insert(cols.index("Clonotype") + 1, cols.pop(cols.index("Label")))
    result_df = result_df[cols]

    result_df.to_csv(output_csv, index=False)

    # Create volcano_data.csv
    enrich_cols = [f"Enrichment {cond} vs {condition_order[0]}" for cond in condition_order[1:]]
    result_df["MaxAbsEnrichment"] = result_df[enrich_cols].abs().max(axis=1)
    volcano_df = result_df.nlargest(top_n_volcano, "MaxAbsEnrichment")

    # Reorder volcano columns
    cols = volcano_df.columns.tolist()
    if "Label" in cols and "Clonotype" in cols:
        cols.insert(cols.index("Clonotype") + 1, cols.pop(cols.index("Label")))
    volcano_df = volcano_df[cols]
    volcano_df.to_csv(volcano_csv, index=False)

    # Create bubble_data.csv
    bubble_rows = []
    for _, row in result_df.iterrows():
        clonotype = row["Clonotype"]
        max_enrich = max([row[f"Enrichment {cond} vs {condition_order[0]}"] for cond in condition_order[1:]])
        for cond in condition_order[1:]:
            enrich = row[f"Enrichment {cond} vs {condition_order[0]}"]
            freq = row[f"Frequency {cond}"]
            if enrich > 0:
                bubble_rows.append({
                    "Clonotype": clonotype,
                    "Label": clonotype_labels[clonotype],
                    "Condition": cond,
                    "Enrichment": enrich,
                    "Frequency": freq,
                    "MaxEnrichment": max_enrich
                })

    bubble_df = pd.DataFrame(bubble_rows)

    # Reorder bubble columns
    cols = bubble_df.columns.tolist()
    if "Label" in cols and "Clonotype" in cols:
        cols.insert(cols.index("Clonotype") + 1, cols.pop(cols.index("Label")))
    bubble_df = bubble_df[cols]

    top_clonotypes = (
        bubble_df.groupby("Clonotype")["MaxEnrichment"]
        .max()
        .sort_values(ascending=False)
        .head(top_n_bubble)
        .index
    )
    bubble_df = bubble_df[bubble_df["Clonotype"].isin(top_clonotypes)]
    bubble_df.to_csv(bubble_csv, index=False)

    return result_df

# --- Command-line interface ---
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Hybrid Enrichment Analysis")
    parser.add_argument("--counts", required=True, help="Path to counts CSV")
    parser.add_argument("--metadata", required=True, help="Path to sample metadata CSV")
    parser.add_argument("--condition_column", required=True, help="Column name in metadata representing condition")
    parser.add_argument("--output", required=True, help="Path to enrichment output CSV")
    parser.add_argument("--volcano", required=True, help="Path to volcano plot CSV")
    parser.add_argument("--bubble", required=True, help="Path to bubble plot CSV")
    parser.add_argument("--conditions", nargs="+", required=True, help="Ordered list of condition labels")
    parser.add_argument("--use_penalty", action="store_true", help="Use correction factor penalty")
    parser.add_argument("--penalty_enrich", type=int, default=2, help="Penalty for enrichment absences")
    parser.add_argument("--penalty_deplete", type=int, default=10, help="Penalty for depletion absences")
    parser.add_argument("--top_n_volcano", type=int, default=1000, help="Top N clonotypes for volcano plot")
    parser.add_argument("--top_n_bubble", type=int, default=20, help="Top N clonotypes for bubble plot")

    args = parser.parse_args()

    hybrid_enrichment_analysis(
        counts_csv=args.counts,
        sample_metadata_csv=args.metadata,
        condition_column=args.condition_column,
        condition_order=args.conditions,
        output_csv=args.output,
        volcano_csv=args.volcano,
        bubble_csv=args.bubble,
        use_penalty=args.use_penalty,
        penalty_enrich=args.penalty_enrich,
        penalty_deplete=args.penalty_deplete,
        top_n_volcano=args.top_n_volcano,
        top_n_bubble=args.top_n_bubble
    )
