import polars as pl


def filter_by_condition(
    enrichment_file,
    condition
):
    """
    Filter enrichment data by condition using polars for better performance.
    """
    enrichment_df = pl.read_csv(enrichment_file)
    enrichment_df = enrichment_df.filter(pl.col("Condition").cast(pl.Utf8) == condition)

    enrichment_df.write_csv("filtered.csv")

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Hybrid Enrichment Analysis - Filter by Condition")
    parser.add_argument("--enrichment_file", required=True)
    parser.add_argument("--condition", required=True)
    
    args = parser.parse_args()

    filter_by_condition(
        enrichment_file=args.enrichment_file,
        condition=args.condition
        
    )
