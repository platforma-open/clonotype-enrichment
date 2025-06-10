import pandas as pd
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


downsampling_params = parse_params()
data = pd.read_csv(input_file, sep=",")

totals = data.groupby('sampleId')['abundance'].sum().reset_index()
# Calculate 20th percentile across all totals
q20 = totals['abundance'].quantile(0.2)
# Find the minimum value that is above 0.5*q20
min_above_threshold = totals[totals['abundance'] > 0.5 * q20]['abundance'].min()
fixed_auto_downsampling_value = min_above_threshold if not pd.isna(
    min_above_threshold) else q20


def downsample(df, downsampling):
    if downsampling['type'] == "none":
        return df

    elif downsampling['type'] == "hypergeometric":
        if downsampling['valueChooser'] == "min":
            value = totals['abundance'].min()
        elif downsampling['valueChooser'] == "fixed":
            value = downsampling['n']
        elif downsampling['valueChooser'] == "auto":
            value = fixed_auto_downsampling_value

        if df['abundance'].sum() < value:
            return df

        rng = default_rng(31415)  # always fix seed for reproducibility

        df['abundance'] = rng.multivariate_hypergeometric(
            df['abundance'].astype(np.int64), value)

        # Comment for ENRICHMENT pipeline (we just downsample, not normalise)
        #df = df.loc[df['abundance'] != 0]
        return df

    else:
        raise ValueError(f"Invalid downsampling type: {downsampling['type']}")

bySample = data.groupby('sampleId')

# Store downsampled abundance in table
downsampled_id = 'downsampledAbundance'
data[downsampled_id] = None
for sampleId, df in bySample:
    downsampled = downsample(df, downsampling_params)
    # downsampled['fraction'] = downsampled['abundance'] / \
    #     downsampled['abundance'].sum()
    data.loc[downsampled.index, downsampled_id] =\
        downsampled.loc[downsampled.index, "abundance"]

data.to_csv('result.csv', sep=',', index=False)
