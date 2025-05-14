import pandas as pd
import numpy as np
import json

def hybrid_enrichment_analysis(
    input_data_csv,
    condition_order,
    enrichment_csv,
    volcano_csv,
    bubble_csv,
    top_enriched_csv,
    top_20_csv=None,
    use_penalty=True,
    penalty_enrich=2,
    penalty_deplete=10,
    top_n_volcano=1000,
    top_n_bubble=20,
    top_n_enriched=5,
    min_enrichment=3
):
    input_df = pd.read_csv(input_data_csv)

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
        enrichments = {}
        for cond in condition_order:
            total = total_reads.get(cond, 1)
            abundance = pivot_df.at[elementId, cond]
            if abundance > 0:
                freqs[cond] = abundance / total
            else:
                pseudocount = 1 / total
                if use_penalty:
                    base_count = pivot_df.loc[elementId].replace(0, np.nan).min()
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

        row = {'elementId': elementId}
        for cond in condition_order:
            row[f'Frequency {cond}'] = freqs[cond]
        row.update(enrichments)
        result_rows.append(row)

    result_df = pd.DataFrame(result_rows)

    elementId_labels = {
        elementId: f"C{i+1}"
        for i, elementId in enumerate(result_df["elementId"])
    }

    result_df["Label"] = result_df["elementId"].map(elementId_labels)
    result_df = result_df[["elementId", "Label"] + [col for col in result_df.columns if col not in ["elementId", "Label"]]]

    freq_cols = [f"Frequency {cond}" for cond in condition_order]
    enrich_cols = [f"Enrichment {cond} vs {condition_order[0]}" for cond in condition_order[1:]]

    freq_long = result_df.melt(
        id_vars=["elementId", "Label"],
        value_vars=freq_cols,
        var_name="condition",
        value_name="Frequency"
    )
    freq_long["condition"] = freq_long["condition"].str.replace("Frequency ", "")

    enrich_long = result_df.melt(
        id_vars=["elementId", "Label"],
        value_vars=enrich_cols,
        var_name="condition",
        value_name="Enrichment"
    )
    enrich_long["condition"] = enrich_long["condition"].str.extract(r'Enrichment (.+) vs')[0]

    baseline_df = freq_long[freq_long["condition"] == condition_order[0]].copy()
    baseline_df["Enrichment"] = np.nan
    enrichment_df = pd.concat([baseline_df, pd.merge(freq_long, enrich_long, on=["elementId", "Label", "condition"])])
    enrichment_df.to_csv(enrichment_csv, index=False)

    result_df["MaxAbsEnrichment"] = result_df[enrich_cols].abs().max(axis=1)
    volcano_df = result_df.nlargest(top_n_volcano, "MaxAbsEnrichment")

    volcano_freq_long = volcano_df.melt(
        id_vars=["elementId", "Label"],
        value_vars=freq_cols,
        var_name="condition",
        value_name="Frequency"
    )
    volcano_freq_long["condition"] = volcano_freq_long["condition"].str.replace("Frequency ", "")

    volcano_enrich_long = volcano_df.melt(
        id_vars=["elementId", "Label"],
        value_vars=enrich_cols,
        var_name="condition",
        value_name="Enrichment"
    )
    volcano_enrich_long["condition"] = volcano_enrich_long["condition"].str.extract(r'Enrichment (.+) vs')[0]

    volcano_baseline = volcano_freq_long[volcano_freq_long["condition"] == condition_order[0]].copy()
    volcano_baseline["Enrichment"] = np.nan
    volcano_output = pd.concat([volcano_baseline, pd.merge(volcano_freq_long, volcano_enrich_long, on=["elementId", "Label", "condition"])])
    volcano_output.to_csv(volcano_csv, index=False)

    # Bubble and top enriched
    bubble_rows = []
    for _, row in result_df.iterrows():
        elementId = row["elementId"]
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
                    "elementId": elementId,
                    "Label": elementId_labels[elementId],
                    "condition": cond,
                    "Enrichment": enrich,
                    "Frequency": freq,
                    "MaxEnrichment": max_enrich
                })

    if len(bubble_rows) > 0:
        bubble_df = pd.DataFrame(bubble_rows)
        bubble_df = bubble_df[["elementId", "Label"] + [col for col in bubble_df.columns if col not in ["elementId", "Label"]]]
    # If table is empty (no results above threshold) create empty table
    else:
        bubble_df = pd.DataFrame(columns=["elementId", "Label",  "condition", "Enrichment", "Frequency",
                                        "MaxEnrichment"])

    top_clonotypes = (
        bubble_df.groupby("elementId")["MaxEnrichment"]
        .max()
        .sort_values(ascending=False)
        .head(top_n_bubble)
        .index
    )
    bubble_df = bubble_df[bubble_df["elementId"].isin(top_clonotypes)]
    bubble_df.to_csv(bubble_csv, index=False)

    # Top enriched (frequencies only)
    top_enriched_ids = (
        bubble_df.groupby("elementId")["MaxEnrichment"]
        .max()
        .sort_values(ascending=False)
        .head(top_n_enriched)
        .index
    )
    top_enriched_freq = freq_long[freq_long["elementId"].isin(top_enriched_ids)]
    top_enriched_freq.to_csv(top_enriched_csv, index=False)

    # Top 20 enriched (frequencies only)
    if top_20_csv:
        top_20_ids = (
            bubble_df.groupby("elementId")["MaxEnrichment"]
            .max()
            .sort_values(ascending=False)
            .head(20)
            .index
        )
        top_20_freq = freq_long[freq_long["elementId"].isin(top_20_ids)]
        top_20_freq.to_csv(top_20_csv, index=False)

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Hybrid Enrichment Analysis")
    parser.add_argument("--input_data", required=True, help="Path to the combined input CSV file. Expected columns: sampleId, elementId, abundance, and the condition column specified by --condition_column.")
    parser.add_argument("--conditions", type=str, required=True)
    parser.add_argument("--enrichment", required=True)
    parser.add_argument("--volcano", required=True)
    parser.add_argument("--bubble", required=True)
    parser.add_argument("--top_enriched", required=True)
    parser.add_argument("--top_20", required=False)
    parser.add_argument("--use_penalty", action="store_true")
    parser.add_argument("--penalty_enrich", type=int, default=2)
    parser.add_argument("--penalty_deplete", type=int, default=10)
    parser.add_argument("--top_n_volcano", type=int, default=1000)
    parser.add_argument("--top_n_bubble", type=int, default=20)
    parser.add_argument("--top_n_enriched", type=int, default=5)
    parser.add_argument("--min_enrichment", type=float, default=3)

    args = parser.parse_args()

    hybrid_enrichment_analysis(
        input_data_csv=args.input_data,
        condition_order=json.loads(args.conditions),
        enrichment_csv=args.enrichment,
        volcano_csv=args.volcano,
        bubble_csv=args.bubble,
        top_enriched_csv=args.top_enriched,
        top_20_csv=args.top_20,
        use_penalty=args.use_penalty,
        penalty_enrich=args.penalty_enrich,
        penalty_deplete=args.penalty_deplete,
        top_n_volcano=args.top_n_volcano,
        top_n_bubble=args.top_n_bubble,
        top_n_enriched=args.top_n_enriched,
        min_enrichment=args.min_enrichment
    )
