import polars as pl
import numpy as np
from numpy.random import default_rng
import json
from scipy.special import binom


# sample cloneKey count

input_file = "input.csv"
downsampling_file = "downsampling.json"


# Parse the parameters from the JSON file
def parse_params():
    try:
        with open(downsampling_file, 'r') as f:
            downsampling_params = json.load(f)
        return downsampling_params
    except FileNotFoundError:
        print(f"Error: Parameters file '{downsampling_file}' not found.")
        return {}
    except json.JSONDecodeError:
        print(f"Error: Could not parse '{downsampling_file}' as valid JSON.")
        return {}


def downsample_sample(sample_df, downsampling):
    """
    Downsample a dataframe representing a single sample using polars.
    """
    if downsampling['type'] == "none":
        return sample_df.with_columns(pl.col('abundance').alias('downsampledAbundance'))

    elif downsampling['type'] == "hypergeometric":
        if downsampling['valueChooser'] == "min":
            value = np.min(totals_values)
        elif downsampling['valueChooser'] == "fixed":
            value = downsampling['n']
        elif downsampling['valueChooser'] == "auto":
            value = fixed_auto_downsampling_value

        total_abundance = sample_df.select(pl.col('abundance').sum()).item()
        if total_abundance < value:
            return sample_df.with_columns(pl.col('abundance').alias('downsampledAbundance'))

        rng = default_rng(31415)  # always fix seed for reproducibility

        # Convert to numpy for hypergeometric sampling
        abundance_values = sample_df.select('abundance').to_numpy().flatten().astype(np.int64)
        downsampled_values = rng.multivariate_hypergeometric(abundance_values, int(value))
        
        # Create new dataframe with downsampled values
        result_df = sample_df.with_columns(pl.lit(downsampled_values).alias('downsampledAbundance'))
        
        return result_df

    else:
        raise ValueError(f"Invalid downsampling type: {downsampling['type']}")

downsampling_params = parse_params()
data = pl.read_csv(input_file)
# Check if abundance column is string type and filter empty strings before casting
if data.schema['abundance'] in [pl.Utf8, pl.String]:
    data = data.filter(pl.col('abundance').ne(""))
data = data.with_columns(pl.col("abundance").cast(pl.Int64))

# If there are no clonotypes, return empty dataframe
if data.count()["elementId"].item() == 0:
    data = data.with_columns(pl.lit(0).alias('downsampledAbundance'))
    data.write_csv('result.csv')
    exit()

# Calculate sample totals efficiently
totals = data.group_by('sampleId').agg(pl.col('abundance').sum())
totals_values = totals.select('abundance').to_numpy().flatten()

# Calculate 20th percentile across all totals
q20 = np.percentile(totals_values, 20)

# Find the minimum value that is above 0.5*q20
above_threshold = totals_values[totals_values > 0.5 * q20]
min_above_threshold = np.min(above_threshold) if len(above_threshold) > 0 else q20
fixed_auto_downsampling_value = min_above_threshold

# Process each sample group efficiently
downsampled_parts = []

# Get unique sample IDs in sorted order for deterministic processing
sample_ids = data.select('sampleId').unique().sort('sampleId').to_series()

for sample_id in sample_ids:
    # Filter data for this sample
    sample_data = data.filter(pl.col('sampleId') == sample_id)
    
    # Downsample this sample
    downsampled_sample = downsample_sample(sample_data, downsampling_params)
    
    # Add to results
    downsampled_parts.append(downsampled_sample)

# Combine all parts
if downsampled_parts:
    result_data = pl.concat(downsampled_parts)
else:
    result_data = data.with_columns(pl.col('abundance').alias('downsampledAbundance'))

# Write the result to CSV
result_data.write_csv('result.csv')
