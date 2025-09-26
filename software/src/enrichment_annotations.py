import polars as pl
import numpy as np
import argparse
import os

def process_enrichment(input_file, output_dir='.', enrichment_column='Enrichment'):
    """
    Process enrichment data using polars for better performance.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    df = pl.read_csv(input_file)
    if df.is_empty():
        df = None  # Mark as empty

    if df is None:
        nan_value = "NaN"
        output_files = {
            'enrichment_min.txt': nan_value,
            'enrichment_max.txt': nan_value,
            'enrichment_median.txt': nan_value,
            'enrichment_mean.txt': nan_value,
            'enrichment_75.txt': nan_value
        }
    else:
        # Extract the 'Enrichment' column and calculate statistics
        enrichment_stats = df.select([
            pl.col(enrichment_column).min().alias('min'),
            pl.col(enrichment_column).max().alias('max'),
            pl.col(enrichment_column).median().alias('median'),
            pl.col(enrichment_column).mean().alias('mean'),
            pl.col(enrichment_column).quantile(0.75).alias('p75')
        ])

        # Get the values from the result
        enrichment_min = enrichment_stats['min'][0]
        enrichment_max = enrichment_stats['max'][0]
        enrichment_median = enrichment_stats['median'][0]
        enrichment_mean = enrichment_stats['mean'][0]
        enrichment_75 = enrichment_stats['p75'][0]

        # For the 75th percentile, output 1 if the value is less than or equal to 1
        enrichment_75_out = enrichment_75 if enrichment_75 > 1 else 1

        # Write results to txt files
        output_files = {
            'enrichment_min.txt': f"{enrichment_min:.2f}",
            'enrichment_max.txt': f"{enrichment_max:.2f}",
            'enrichment_median.txt': f"{enrichment_median:.2f}",
            'enrichment_mean.txt': f"{enrichment_mean:.2f}",
            'enrichment_75.txt': f"{enrichment_75_out:.2f}" 
        }

    for filename, content in output_files.items():
        output_path = os.path.join(output_dir, filename)
        with open(output_path, 'w') as f:
            f.write(content)
        print(f"Written {filename} to {output_path}")

def main():
    parser = argparse.ArgumentParser(description='Process enrichment data from a CSV file.')
    parser.add_argument('input_file', help='Path to the input CSV file containing enrichment data')
    parser.add_argument('--enrichment-column', default='Enrichment', help='Label of the enrichment column')
    parser.add_argument('--output-dir', '-o', default='.',
                      help='Directory to save output files (default: current directory)')
    
    args = parser.parse_args()
    
    try:
        process_enrichment(args.input_file, args.output_dir, args.enrichment_column)
    except FileNotFoundError:
        print(f"Error: Input file '{args.input_file}' not found.")
        exit(1)
    except pl.exceptions.ComputeError as e:
        error_msg = str(e).lower()
        if "not found" in error_msg or "enrichment" in error_msg:
            print(f"Error: Input file must contain an '{args.enrichment_column}' column.")
            exit(1)
        else:
            print(f"Error processing data: {str(e)}")
            exit(1)
    except Exception as e:
        print(f"An error occurred: {str(e)}")
        exit(1)

if __name__ == '__main__':
    main()
