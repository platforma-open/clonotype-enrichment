import pandas as pd


def filter_by_condition(
    enrichment_file,
    condition
):
    enrichment_df = pd.read_csv(enrichment_file)
    enrichment_df = enrichment_df[enrichment_df["Condition"].astype(str) == condition]

    enrichment_df.to_csv("filtered.csv", index=False)

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Hybrid Enrichment Analysis")
    parser.add_argument("--enrichment_file", required=True)
    parser.add_argument("--condition", required=True)
    
    args = parser.parse_args()

    filter_by_condition(
        enrichment_file=args.enrichment_file,
        condition=args.condition
        
    )
