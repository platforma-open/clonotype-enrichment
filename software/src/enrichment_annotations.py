import pandas as pd
import numpy as np
import argparse
import os

def process_enrichment(input_file, output_dir='.'):
    # Read the CSV file
    df = pd.read_csv(input_file)

    # Extract the 'Enrichment' column
    enrichment_values = df['Enrichment'].values

    # Calculate min, max, and 75th percentile
    enrichment_min = np.min(enrichment_values)
    enrichment_max = np.max(enrichment_values)
    enrichment_75 = np.percentile(enrichment_values, 75)

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
    except pd.errors.EmptyDataError:
        print(f"Error: Input file '{args.input_file}' is empty.")
        exit(1)
    except KeyError:
        print("Error: Input file must contain an 'Enrichment' column.")
        exit(1)
    except Exception as e:
        print(f"An error occurred: {str(e)}")
        exit(1)

if __name__ == '__main__':
    main()
