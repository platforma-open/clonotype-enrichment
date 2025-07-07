import polars as pl
import numpy as np
import argparse
import os

def process_enrichment(input_file, output_dir='.'):
    """
    Process enrichment data using polars for better performance.
    """
    # Read the CSV file
    df = pl.read_csv(input_file)

    # Extract the 'Enrichment' column and calculate statistics
    enrichment_stats = df.select([
        pl.col('Enrichment').min().alias('min'),
        pl.col('Enrichment').max().alias('max'),
        pl.col('Enrichment').quantile(0.75).alias('p75')
    ])

    # Get the values from the result
    enrichment_min = enrichment_stats['min'][0]
    enrichment_max = enrichment_stats['max'][0]
    enrichment_75 = enrichment_stats['p75'][0]

    # For the 75th percentile, output 1 if the value is less than or equal to 1
    enrichment_75_out = enrichment_75 if enrichment_75 > 1 else 1

    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    # Write results to txt files
    output_files = {
        'enrichment_min.txt': str(enrichment_min),
        'enrichment_max.txt': str(enrichment_max),
        'enrichment_75.txt': str(enrichment_75_out)
    }

    for filename, content in output_files.items():
        output_path = os.path.join(output_dir, filename)
        with open(output_path, 'w') as f:
            f.write(content)
        print(f"Written {filename} to {output_path}")

def main():
    parser = argparse.ArgumentParser(description='Process enrichment data from a CSV file.')
    parser.add_argument('input_file', help='Path to the input CSV file containing enrichment data')
    parser.add_argument('--output-dir', '-o', default='.',
                      help='Directory to save output files (default: current directory)')
    
    args = parser.parse_args()
    
    try:
        process_enrichment(args.input_file, args.output_dir)
    except FileNotFoundError:
        print(f"Error: Input file '{args.input_file}' not found.")
        exit(1)
    except pl.exceptions.ComputeError as e:
        error_msg = str(e).lower()
        if "not found" in error_msg or "enrichment" in error_msg:
            print("Error: Input file must contain an 'Enrichment' column.")
            exit(1)
        else:
            print(f"Error processing data: {str(e)}")
            exit(1)
    except Exception as e:
        error_msg = str(e).lower()
        if "empty" in error_msg or "no data" in error_msg:
            print(f"Error: Input file '{args.input_file}' appears to be empty or invalid.")
            exit(1)
        else:
            print(f"An error occurred: {str(e)}")
            exit(1)

if __name__ == '__main__':
    main()
