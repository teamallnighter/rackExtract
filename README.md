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

