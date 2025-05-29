import pandas as pd
import numpy as np
from numpy.random import default_rng
import json
from scipy.special import binom


# sample cloneKey count

input_file = "input.csv"
params_file = "metrics.json"


# Parse the parameters from the JSON file
def parse_params():
    try:
        with open(params_file, 'r') as f:
            params = json.load(f)
        return params
    except FileNotFoundError:
        print(f"Error: Parameters file '{params_file}' not found.")
        return {}
    except json.JSONDecodeError:
        print(f"Error: Could not parse '{params_file}' as valid JSON.")
        return {}


params = parse_params()
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

    if downsampling['type'] == "top":
        top_n = downsampling['n']
        return df.nlargest(top_n, 'abundance')

    if downsampling['type'] == "cumtop":
        top_fraction = downsampling['n']
        target_count = top_fraction * df['abundance'].sum()

        sorted = df.sort_values('abundance', ascending=False)

        sorted['cumsum'] = sorted['abundance'].cumsum()
        selected_rows = sorted[sorted['cumsum'] <= target_count]

        # If no rows meet the criteria (rare case), take at least the top row
        if selected_rows.empty:
            selected_rows = sorted.head(1)
        return selected_rows

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

# We will only have one metric here
metric = params[0]
metric_id = 'downsampledAbundance'
data[metric_id] = None
for sampleId, df in bySample:
    downsampled = downsample(df, metric["downsampling"])
    # downsampled['fraction'] = downsampled['abundance'] / \
    #     downsampled['abundance'].sum()
    data.loc[downsampled.index, metric_id] =\
        downsampled.loc[downsampled.index, "abundance"]

# convert Nan values to zero

data.to_csv('result.csv', sep=',', index=False)
