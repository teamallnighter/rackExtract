# rackExtract

## Overview

This Max/MSP JavaScript tool enables users to extract detailed hierarchical workflow data from Ableton Live's set, specifically focusing on devices, chains (nested racks), and parameters. It provides functions to analyze specific tracks, devices, or chains and outputs a structured JSON object that encapsulates all relevant information about the selected element.

## Features

Extracts data for

- Devices within tracks
- Chains (nested racks) within devices
- Parameters of devices and chains
- Connections and hierarchy of devices and chains
- Recursive traversal of nested chains/racks

**Cleanses corrupted data (specifically 5e-324 placeholders)**

**JSON output for integration with other tools, visualization, or analysis**

## Usage

## Initialization

Copy and paste the code into a [js] object in MAX

## Commands

Send a message to the [js] object

```
[extract_workflow trackID deviceID]

```

You dont need brackets or commas. 

If you want to drill it down even more just user the LOM:

```
[extract_workflow 1 0 1 0]

```

Would go to the second channel, the first device, the second chain, and thr first device in that chain.

### Output

```json

workflow_json "{"metadata": {
    "extracted_at": "2025-07-20T10:25:53.471Z",
    "track_id": 1,
    "device_id": 0,
    "extractor_version": "1.0"
},
"workflow": {
    "root_device": {
        "name": "EZFREQSPLIT",
        "path": "live_set tracks 1 devices 0",
        "type": "rack",
        "class_name": "AudioEffectGroupDevice",
        "visible_macro_count": 6,
        "variation_count": 3,
        "macros": [
            {
                "parameter_id": 0,
                "name": "Device On",
                "value": 1,
                "display_value": 1,
                "default_value": null,
                "min": 0,
                "max": 1,
                "is_quantized": 1
            },
            {
                "parameter_id": 1,
                "name": "FreqLo",
                "value": 44.38459777832031,
                "display_value": 250,
                "default_value": 44.38459777832031,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 2,
                "name": "FreqHi",
                "value": 71.2846908569336,
                "display_value": 2500,
                "default_value": 71.2846908569336,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 3,
                "name": "GainLo",
                "value": 76,
                "display_value": -10.100000381469727,
                "default_value": 107.95000457763672,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 4,
                "name": "GainMid",
                "value": 107.95000457763672,
                "display_value": 0,
                "default_value": 107.95000457763672,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 5,
                "name": "GainHi",
                "value": 73,
                "display_value": -11,
                "default_value": 107.95000457763672,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 6,
                "name": "Macro 6",
                "value": 0,
                "display_value": 0,
                "default_value": 0,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 7,
                "name": "Macro 7",
                "value": 0,
                "display_value": 0,
                "default_value": 0,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 8,
                "name": "Macro 8",
                "value": 0,
                "display_value": 0,
                "default_value": 0,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 9,
                "name": "Macro 9",
                "value": 0,
                "display_value": 0,
                "default_value": 0,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 10,
                "name": "Macro 10",
                "value": 0,
                "display_value": 0,
                "default_value": 0,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 11,
                "name": "Macro 11",
                "value": 0,
                "display_value": 0,
                "default_value": 0,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 12,
                "name": "Macro 12",
                "value": 0,
                "display_value": 0,
                "default_value": 0,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 13,
                "name": "Macro 13",
                "value": 0,
                "display_value": 0,
                "default_value": 0,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 14,
                "name": "Macro 14",
                "value": 0,
                "display_value": 0,
                "default_value": 0,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 15,
                "name": "Macro 15",
                "value": 0,
                "display_value": 0,
                "default_value": 0,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 16,
                "name": "Macro 16",
                "value": 0,
                "display_value": 0,
                "default_value": 0,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            },
            {
                "parameter_id": 17,
                "name": "Chain Selector",
                "value": 0,
                "display_value": 0,
                "default_value": 0,
                "min": 0,
                "max": 127,
                "is_quantized": 0
            }
        ]
    },
    "devices": [
        {
            "device_id": 0,
            "name": "LOW-EQ3",
            "path": "live_set tracks 1 devices 0 chains 0 devices 0",
            "depth": 1,
            "type": "device",
            "parameters": [
                {
                    "parameter_id": 0,
                    "name": "Device On",
                    "value": 1,
                    "display_value": 1,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                },
                {
                    "parameter_id": 1,
                    "name": "GainLo",
                    "value": 0.5984252095222473,
                    "display_value": -10.100000381469727,
                    "default_value": 0.8500000238418579,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 2,
                    "name": "GainMid",
                    "value": 0.8500000238418579,
                    "display_value": 0,
                    "default_value": 0.8500000238418579,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 3,
                    "name": "GainHi",
                    "value": 0.5748031735420227,
                    "display_value": -11,
                    "default_value": 0.8500000238418579,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 4,
                    "name": "FreqLo",
                    "value": 0.34948500990867615,
                    "display_value": 250,
                    "default_value": 0.34948500990867615,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 5,
                    "name": "FreqHi",
                    "value": 0.5612967610359192,
                    "display_value": 2500,
                    "default_value": 0.5612967610359192,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 6,
                    "name": "LowOn",
                    "value": 1,
                    "display_value": 1,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                },
                {
                    "parameter_id": 7,
                    "name": "MidOn",
                    "value": 0,
                    "display_value": 0,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                },
                {
                    "parameter_id": 8,
                    "name": "HighOn",
                    "value": 0,
                    "display_value": 0,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                },
                {
                    "parameter_id": 9,
                    "name": "Slope",
                    "value": 1,
                    "display_value": 1,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                }
            ]
        },
        {
            "device_id": 0,
            "name": "MIDS-EQ3",
            "path": "live_set tracks 1 devices 0 chains 1 devices 0",
            "depth": 1,
            "type": "device",
            "parameters": [
                {
                    "parameter_id": 0,
                    "name": "Device On",
                    "value": 1,
                    "display_value": 1,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                },
                {
                    "parameter_id": 1,
                    "name": "GainLo",
                    "value": 0.5984252095222473,
                    "display_value": -10.100000381469727,
                    "default_value": 0.8500000238418579,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 2,
                    "name": "GainMid",
                    "value": 0.8500000238418579,
                    "display_value": 0,
                    "default_value": 0.8500000238418579,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 3,
                    "name": "GainHi",
                    "value": 0.5748031735420227,
                    "display_value": -11,
                    "default_value": 0.8500000238418579,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 4,
                    "name": "FreqLo",
                    "value": 0.34948500990867615,
                    "display_value": 250,
                    "default_value": 0.34948500990867615,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 5,
                    "name": "FreqHi",
                    "value": 0.5612967610359192,
                    "display_value": 2500,
                    "default_value": 0.5612967610359192,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 6,
                    "name": "LowOn",
                    "value": 0,
                    "display_value": 0,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                },
                {
                    "parameter_id": 7,
                    "name": "MidOn",
                    "value": 1,
                    "display_value": 1,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                },
                {
                    "parameter_id": 8,
                    "name": "HighOn",
                    "value": 0,
                    "display_value": 0,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                },
                {
                    "parameter_id": 9,
                    "name": "Slope",
                    "value": 1,
                    "display_value": 1,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                }
            ]
        },
        {
            "device_id": 0,
            "name": "HIGHS-EQ3",
            "path": "live_set tracks 1 devices 0 chains 2 devices 0",
            "depth": 1,
            "type": "device",
            "parameters": [
                {
                    "parameter_id": 0,
                    "name": "Device On",
                    "value": 1,
                    "display_value": 1,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                },
                {
                    "parameter_id": 1,
                    "name": "GainLo",
                    "value": 0.5984252095222473,
                    "display_value": -10.100000381469727,
                    "default_value": 0.8500000238418579,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 2,
                    "name": "GainMid",
                    "value": 0.8500000238418579,
                    "display_value": 0,
                    "default_value": 0.8500000238418579,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 3,
                    "name": "GainHi",
                    "value": 0.5748031735420227,
                    "display_value": -11,
                    "default_value": 0.8500000238418579,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 4,
                    "name": "FreqLo",
                    "value": 0.34948500990867615,
                    "display_value": 250,
                    "default_value": 0.34948500990867615,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 5,
                    "name": "FreqHi",
                    "value": 0.5612967610359192,
                    "display_value": 2500,
                    "default_value": 0.5612967610359192,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 0
                },
                {
                    "parameter_id": 6,
                    "name": "LowOn",
                    "value": 0,
                    "display_value": 0,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                },
                {
                    "parameter_id": 7,
                    "name": "MidOn",
                    "value": 0,
                    "display_value": 0,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                },
                {
                    "parameter_id": 8,
                    "name": "HighOn",
                    "value": 1,
                    "display_value": 1,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                },
                {
                    "parameter_id": 9,
                    "name": "Slope",
                    "value": 1,
                    "display_value": 1,
                    "default_value": null,
                    "min": 0,
                    "max": 1,
                    "is_quantized": 1
                }
            ]
        }
    ],
    "chains": [
        {
            "chain_id": 0,
            "path": "live_set tracks 1 devices 0 chains 0",
            "depth": 0,
            "devices": [
                {
                    "device_id": 0,
                    "name": "LOW-EQ3",
                    "path": "live_set tracks 1 devices 0 chains 0 devices 0",
                    "depth": 1,
                    "type": "device",
                    "parameters": [
                        {
                            "parameter_id": 0,
                            "name": "Device On",
                            "value": 1,
                            "display_value": 1,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        },
                        {
                            "parameter_id": 1,
                            "name": "GainLo",
                            "value": 0.5984252095222473,
                            "display_value": -10.100000381469727,
                            "default_value": 0.8500000238418579,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 2,
                            "name": "GainMid",
                            "value": 0.8500000238418579,
                            "display_value": 0,
                            "default_value": 0.8500000238418579,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 3,
                            "name": "GainHi",
                            "value": 0.5748031735420227,
                            "display_value": -11,
                            "default_value": 0.8500000238418579,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 4,
                            "name": "FreqLo",
                            "value": 0.34948500990867615,
                            "display_value": 250,
                            "default_value": 0.34948500990867615,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 5,
                            "name": "FreqHi",
                            "value": 0.5612967610359192,
                            "display_value": 2500,
                            "default_value": 0.5612967610359192,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 6,
                            "name": "LowOn",
                            "value": 1,
                            "display_value": 1,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        },
                        {
                            "parameter_id": 7,
                            "name": "MidOn",
                            "value": 0,
                            "display_value": 0,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        },
                        {
                            "parameter_id": 8,
                            "name": "HighOn",
                            "value": 0,
                            "display_value": 0,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        },
                        {
                            "parameter_id": 9,
                            "name": "Slope",
                            "value": 1,
                            "display_value": 1,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        }
                    ]
                }
            ]
        },
        {
            "chain_id": 1,
            "path": "live_set tracks 1 devices 0 chains 1",
            "depth": 0,
            "devices": [
                {
                    "device_id": 0,
                    "name": "MIDS-EQ3",
                    "path": "live_set tracks 1 devices 0 chains 1 devices 0",
                    "depth": 1,
                    "type": "device",
                    "parameters": [
                        {
                            "parameter_id": 0,
                            "name": "Device On",
                            "value": 1,
                            "display_value": 1,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        },
                        {
                            "parameter_id": 1,
                            "name": "GainLo",
                            "value": 0.5984252095222473,
                            "display_value": -10.100000381469727,
                            "default_value": 0.8500000238418579,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 2,
                            "name": "GainMid",
                            "value": 0.8500000238418579,
                            "display_value": 0,
                            "default_value": 0.8500000238418579,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 3,
                            "name": "GainHi",
                            "value": 0.5748031735420227,
                            "display_value": -11,
                            "default_value": 0.8500000238418579,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 4,
                            "name": "FreqLo",
                            "value": 0.34948500990867615,
                            "display_value": 250,
                            "default_value": 0.34948500990867615,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 5,
                            "name": "FreqHi",
                            "value": 0.5612967610359192,
                            "display_value": 2500,
                            "default_value": 0.5612967610359192,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 6,
                            "name": "LowOn",
                            "value": 0,
                            "display_value": 0,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        },
                        {
                            "parameter_id": 7,
                            "name": "MidOn",
                            "value": 1,
                            "display_value": 1,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        },
                        {
                            "parameter_id": 8,
                            "name": "HighOn",
                            "value": 0,
                            "display_value": 0,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        },
                        {
                            "parameter_id": 9,
                            "name": "Slope",
                            "value": 1,
                            "display_value": 1,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        }
                    ]
                }
            ]
        },
        {
            "chain_id": 2,
            "path": "live_set tracks 1 devices 0 chains 2",
            "depth": 0,
            "devices": [
                {
                    "device_id": 0,
                    "name": "HIGHS-EQ3",
                    "path": "live_set tracks 1 devices 0 chains 2 devices 0",
                    "depth": 1,
                    "type": "device",
                    "parameters": [
                        {
                            "parameter_id": 0,
                            "name": "Device On",
                            "value": 1,
                            "display_value": 1,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        },
                        {
                            "parameter_id": 1,
                            "name": "GainLo",
                            "value": 0.5984252095222473,
                            "display_value": -10.100000381469727,
                            "default_value": 0.8500000238418579,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 2,
                            "name": "GainMid",
                            "value": 0.8500000238418579,
                            "display_value": 0,
                            "default_value": 0.8500000238418579,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 3,
                            "name": "GainHi",
                            "value": 0.5748031735420227,
                            "display_value": -11,
                            "default_value": 0.8500000238418579,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 4,
                            "name": "FreqLo",
                            "value": 0.34948500990867615,
                            "display_value": 250,
                            "default_value": 0.34948500990867615,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 5,
                            "name": "FreqHi",
                            "value": 0.5612967610359192,
                            "display_value": 2500,
                            "default_value": 0.5612967610359192,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 0
                        },
                        {
                            "parameter_id": 6,
                            "name": "LowOn",
                            "value": 0,
                            "display_value": 0,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        },
                        {
                            "parameter_id": 7,
                            "name": "MidOn",
                            "value": 0,
                            "display_value": 0,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        },
                        {
                            "parameter_id": 8,
                            "name": "HighOn",
                            "value": 1,
                            "display_value": 1,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        },
                        {
                            "parameter_id": 9,
                            "name": "Slope",
                            "value": 1,
                            "display_value": 1,
                            "default_value": null,
                            "min": 0,
                            "max": 1,
                            "is_quantized": 1
                        }
                    ]
                }
            ]
        }
    ],
    "parameters": [],
    "connections": []
}
}"

```