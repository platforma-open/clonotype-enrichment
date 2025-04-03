import pandas as pd
import numpy as np
import json

def hybrid_enrichment_analysis(
    counts_csv,
    sample_metadata_csv,
    condition_column,
    condition_order,
    enrichment_csv,
    volcano_csv,
    bubble_csv,
    top_enriched_csv,
    clonotype_map_csv=None,
    use_penalty=True,
    penalty_enrich=2,
    penalty_deplete=10,
    top_n_volcano=1000,
    top_n_bubble=20,
    top_n_enriched=5,
    min_enrichment=3
):
    counts_df = pd.read_csv(counts_csv)
    metadata_df = pd.read_csv(sample_metadata_csv)

    counts_df = counts_df.rename(columns={"Clonotype key": "Clonotype", "Number Of Reads": "Count"})
    if condition_column not in metadata_df.columns:
        raise ValueError(f"'{condition_column}' not found in metadata CSV columns.")
    metadata_df = metadata_df.rename(columns={condition_column: "Condition"})

    merged_df = counts_df.merge(metadata_df, on='Sample')
    total_reads = merged_df.groupby('Condition')['Count'].sum().to_dict()
    pivot_df = merged_df.groupby(['Clonotype', 'Condition'])['Count'].sum().unstack(fill_value=0)

    for condition in condition_order:
        if condition not in pivot_df.columns:
            pivot_df[condition] = 0

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

    clonotype_labels = {
        clonotype: f"C{i+1}"
        for i, clonotype in enumerate(result_df["Clonotype"])
    }

    # Optional: export mapping of clonotype to label
    if clonotype_map_csv:
        pd.DataFrame(list(clonotype_labels.items()), columns=["Clonotype", "Label"]).to_csv(clonotype_map_csv, index=False)

    result_df["Label"] = result_df["Clonotype"].map(clonotype_labels)
    result_df = result_df[["Clonotype", "Label"] + [col for col in result_df.columns if col not in ["Clonotype", "Label"]]]

    freq_cols = [f"Frequency {cond}" for cond in condition_order]
    enrich_cols = [f"Enrichment {cond} vs {condition_order[0]}" for cond in condition_order[1:]]

    freq_long = result_df.melt(
        id_vars=["Clonotype", "Label"],
        value_vars=freq_cols,
        var_name="Condition",
        value_name="Frequency"
    )
    freq_long["Condition"] = freq_long["Condition"].str.replace("Frequency ", "")

    enrich_long = result_df.melt(
        id_vars=["Clonotype", "Label"],
        value_vars=enrich_cols,
        var_name="Condition",
        value_name="Enrichment"
    )
    enrich_long["Condition"] = enrich_long["Condition"].str.extract(r'Enrichment (.+) vs')[0]

    baseline_df = freq_long[freq_long["Condition"] == condition_order[0]].copy()
    baseline_df["Enrichment"] = np.nan
    enrichment_df = pd.concat([baseline_df, pd.merge(freq_long, enrich_long, on=["Clonotype", "Label", "Condition"])])
    enrichment_df.to_csv(enrichment_csv, index=False)

    result_df["MaxAbsEnrichment"] = result_df[enrich_cols].abs().max(axis=1)
    volcano_df = result_df.nlargest(top_n_volcano, "MaxAbsEnrichment")

    volcano_freq_long = volcano_df.melt(
        id_vars=["Clonotype", "Label"],
        value_vars=freq_cols,
        var_name="Condition",
        value_name="Frequency"
    )
    volcano_freq_long["Condition"] = volcano_freq_long["Condition"].str.replace("Frequency ", "")

    volcano_enrich_long = volcano_df.melt(
        id_vars=["Clonotype", "Label"],
        value_vars=enrich_cols,
        var_name="Condition",
        value_name="Enrichment"
    )
    volcano_enrich_long["Condition"] = volcano_enrich_long["Condition"].str.extract(r'Enrichment (.+) vs')[0]

    volcano_baseline = volcano_freq_long[volcano_freq_long["Condition"] == condition_order[0]].copy()
    volcano_baseline["Enrichment"] = np.nan
    volcano_output = pd.concat([volcano_baseline, pd.merge(volcano_freq_long, volcano_enrich_long, on=["Clonotype", "Label", "Condition"])])
    volcano_output.to_csv(volcano_csv, index=False)

    # Bubble and top enriched
    bubble_rows = []
    for _, row in result_df.iterrows():
        clonotype = row["Clonotype"]
        enrich_vals = [row.get(f"Enrichment {cond} vs {condition_order[0]}") for cond in condition_order[1:] if pd.notnull(row.get(f"Enrichment {cond} vs {condition_order[0]}"))]
        if not enrich_vals:
            continue
        max_enrich = max(enrich_vals)
        if max_enrich < min_enrichment:
            continue
        for cond in condition_order[1:]:
            enrich = row.get(f"Enrichment {cond} vs {condition_order[0]}")
            freq = row[f"Frequency {cond}"]
            if pd.notnull(enrich) and enrich > 0:
                bubble_rows.append({
                    "Clonotype": clonotype,
                    "Label": clonotype_labels[clonotype],
                    "Condition": cond,
                    "Enrichment": enrich,
                    "Frequency": freq,
                    "MaxEnrichment": max_enrich
                })

    bubble_df = pd.DataFrame(bubble_rows)
    bubble_df = bubble_df[["Clonotype", "Label"] + [col for col in bubble_df.columns if col not in ["Clonotype", "Label"]]]

    top_clonotypes = (
        bubble_df.groupby("Clonotype")["MaxEnrichment"]
        .max()
        .sort_values(ascending=False)
        .head(top_n_bubble)
        .index
    )
    bubble_df = bubble_df[bubble_df["Clonotype"].isin(top_clonotypes)]
    bubble_df.to_csv(bubble_csv, index=False)

    # Top enriched (frequencies only)
    top_enriched_ids = (
        bubble_df.groupby("Clonotype")["MaxEnrichment"]
        .max()
        .sort_values(ascending=False)
        .head(top_n_enriched)
        .index
    )
    top_enriched_freq = freq_long[freq_long["Clonotype"].isin(top_enriched_ids)]
    top_enriched_freq.to_csv(top_enriched_csv, index=False)

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Hybrid Enrichment Analysis")
    parser.add_argument("--counts", required=True)
    parser.add_argument("--metadata", required=True)
    parser.add_argument("--condition_column", required=True)
    parser.add_argument("--conditions", type=str, required=True)
    parser.add_argument("--enrichment", required=True)
    parser.add_argument("--volcano", required=True)
    parser.add_argument("--bubble", required=True)
    parser.add_argument("--top_enriched", required=True)
    parser.add_argument("--clonotype_map", required=False)
    parser.add_argument("--use_penalty", action="store_true")
    parser.add_argument("--penalty_enrich", type=int, default=2)
    parser.add_argument("--penalty_deplete", type=int, default=10)
    parser.add_argument("--top_n_volcano", type=int, default=1000)
    parser.add_argument("--top_n_bubble", type=int, default=20)
    parser.add_argument("--top_n_enriched", type=int, default=5)
    parser.add_argument("--min_enrichment", type=float, default=3)

    args = parser.parse_args()

    hybrid_enrichment_analysis(
        counts_csv=args.counts,
        sample_metadata_csv=args.metadata,
        condition_column=args.condition_column,
        condition_order=json.loads(args.conditions),
        enrichment_csv=args.enrichment,
        volcano_csv=args.volcano,
        bubble_csv=args.bubble,
        top_enriched_csv=args.top_enriched,
        clonotype_map_csv=args.clonotype_map,
        use_penalty=args.use_penalty,
        penalty_enrich=args.penalty_enrich,
        penalty_deplete=args.penalty_deplete,
        top_n_volcano=args.top_n_volcano,
        top_n_bubble=args.top_n_bubble,
        top_n_enriched=args.top_n_enriched,
        min_enrichment=args.min_enrichment
    )
