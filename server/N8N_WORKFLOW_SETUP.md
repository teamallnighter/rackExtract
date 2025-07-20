# Rack Knowledge Base n8n Workflow Setup (v2.0 - Modular Pattern Analysis)

## Overview
This enhanced n8n workflow creates an automated pipeline for analyzing Ableton Live rack data using Anthropic Claude AI with **advanced modular pattern recognition**. The system now identifies reusable chain patterns, frequency splitting strategies, and multiband processing templates.

## 🧩 **New in v2.0: Modular Pattern Analysis**

### **Enhanced AI Analysis:**
- **Chain Pattern Recognition**: Identifies frequency splitting, parallel processing, serial chains
- **Modular Building Blocks**: Detects reusable chain templates
- **Multiband Potential**: Suggests how patterns could be applied to different processing types  
- **Chain Substitutions**: Recommends alternative device combinations
- **Template Extraction**: Creates reusable workflow templates

### **Frequency Splitting Intelligence:**
```javascript
// AI now recognizes patterns like:
"EZFREQSPLIT" → 3-band frequency processor
"Could become" → Multiband Compressor, Multiband Reverb, etc.
"Chain template" → Reusable 3-band pattern for any processing
```

## Workflow Components

### 1. **Webhook Trigger** (`webhook-trigger`)
- **Type**: n8n-nodes-base.webhook
- **Function**: Receives rack workflow data from the M4L extractor
- **Endpoint**: `/rack-analysis` (POST)
- **Input Format**: JSON with `workflow` object and optional `user_input`

### 2. **Data Validator** (`data-validator`)
- **Type**: n8n-nodes-base.code
- **Function**: Validates input data and calculates complexity metrics
- **Output**: Enriched data with analysis context

### 3. **Anthropic AI Analysis** (`anthropic-analyzer`)
- **Type**: @n8n/n8n-nodes-langchain.chainLlm
- **Function**: Analyzes rack using Claude AI
- **Output**: Structured JSON with musical insights

### 4. **AI Response Parser** (`parse-ai-response`)
- **Type**: n8n-nodes-base.code
- **Function**: Parses AI response and creates knowledge base entry
- **Features**: Error handling, tag deduplication, searchable content

### 5. **Knowledge Base Storage** (`store-in-airtable`)
- **Type**: n8n-nodes-base.airtable
- **Function**: Stores analyzed rack data in Airtable
- **Table**: `Rack_Knowledge_Base`

### 6. **Similar Rack Search** (`search-similar`)
- **Type**: n8n-nodes-base.airtable  
- **Function**: Finds similar racks based on tags
- **Limit**: 5 most recent matches

### 7. **Response Generator** (`final-response`)
- **Type**: n8n-nodes-base.code
- **Function**: Creates final success response with recommendations

## Setup Instructions

### Prerequisites
1. **n8n instance** with LangChain nodes enabled
2. **Anthropic API key** with Claude access
3. **Airtable account** with API token

### 1. Install Required n8n Packages
```bash
# In your n8n environment
npm install @n8n/n8n-nodes-langchain
```

### 2. Configure Anthropic Credentials
- Go to n8n Settings → Credentials
- Add new "Anthropic API" credential
- Enter your Anthropic API key

### 3. Configure Airtable
- Create new Airtable base called "Rack Knowledge Base"
- Create table "Rack_Knowledge_Base" with these fields:

#### **Core Fields:**
  - `rack_name` (Single line text)
  - `complexity_score` (Number)
  - `device_count` (Number)
  - `chain_count` (Number)
  - `user_use_case` (Long text)
  - `ai_refined_use_case` (Long text)
  - `final_tags` (Long text)

#### **AI Analysis Fields:**
  - `ai_workflow_pattern` (Single line text)
  - `ai_musical_function` (Long text)
  - `ai_skill_level` (Single select: beginner, intermediate, advanced, expert)
  - `ai_sonic_characteristics` (Long text)
  - `ai_genre_suitability` (Long text)

#### **NEW: Modular Analysis Fields:**
  - `modular_chain_patterns` (Long text) - Identified chain patterns
  - `frequency_split_analysis` (Long text) - JSON analysis of frequency splitting
  - `reusable_chains` (Long text) - JSON array of reusable chain modules
  - `multiband_variations` (Long text) - Suggested multiband applications  
  - `modular_templates` (Long text) - Template names this rack could generate
  - `chain_substitutions` (Long text) - JSON of alternative device combinations
  - `modularity_score` (Number) - 1-10 score for modular reusability
  - `is_modular` (Checkbox) - Whether rack has modular patterns
  - `modular_tags` (Long text) - Specific modular search tags

#### **Metadata Fields:**
  - `created_at` (Date)
  - `searchable_content` (Long text)
  - `technical_data_json` (Long text)
  - `ai_optimization_tips` (Long text)
  - `ai_similar_racks` (Long text)
  - `user_genre` (Single line text)
  - `has_user_context` (Checkbox)

### 4. Import Workflow
1. Copy the contents of `knowledge_base_workflow_fixed.json`
2. In n8n, go to Workflows → Import from JSON
3. Paste the JSON and import
4. Update these placeholders:
   - Replace `YOUR_AIRTABLE_BASE_ID` with your actual base ID
   - Set your credential IDs for Anthropic and Airtable

### 5. Test the Workflow
Send a POST request to your webhook URL with this format:
```json
{
  "workflow": {
    "root_device": {
      "name": "EZFREQSPLIT",
      "macros": [
        {"name": "FreqLo", "value": 440, "display_value": "440.00 Hz"},
        {"name": "FreqHi", "value": 4400, "display_value": "4.40 kHz"}
      ]
    },
    "devices": [
      {
        "name": "EQ Three",
        "type": "AuEffectGeneric",
        "parameters": [
          {"name": "GainHi", "value": 0.75, "display_value": "0.75"}
        ]
      }
    ],
    "chains": [
      {"name": "LOW", "depth": 1},
      {"name": "MID", "depth": 1},
      {"name": "HIGH", "depth": 1}
    ]
  },
  "user_input": {
    "use_case": "Frequency splitting for mixing",
    "tags": ["frequency", "splitting", "mixing"],
    "description": "Three-way frequency splitter",
    "genre": "electronic",
    "difficulty": "intermediate"
  }
}
```

## Integration with M4L Extractor

To connect your M4L extractor with this workflow:

1. **Enable webhook in M4L**: Add HTTP request capability to your extractor
2. **Send extracted data**: POST the workflow JSON to your n8n webhook
3. **Include user context**: Add user input for better AI analysis

## Expected Output (Enhanced with Modular Analysis)

The workflow returns comprehensive analysis including modular patterns:
```json
{
  "status": "success",
  "rack_name": "EZFREQSPLIT",
  "complexity_score": 45,
  "analyzed_use_case": "Three-band frequency splitting for mix bus processing",
  "ai_tags": ["frequency-splitting", "mixing", "eq", "parallel-processing"],
  "modular_tags": ["frequency-split-template", "3band-processing", "multiband-foundation"],
  "workflow_pattern": "parallel_frequency_processing",
  "musical_function": "Separates audio into low, mid, and high frequency bands for independent processing",
  "modular_analysis": {
    "is_modular": true,
    "modularity_score": 9,
    "chain_patterns": ["frequency_split_3band", "eq_per_band"],
    "multiband_potential": ["multiband_compression", "multiband_saturation", "multiband_reverb"],
    "reusable_chains": [
      {
        "chain_name": "Low Band EQ Chain",
        "function": "low_frequency_processing", 
        "reusability_score": 9
      }
    ]
  },
  "knowledge_base_id": "recXXXXXXXXXXXXXX",
  "similar_racks": [
    {"name": "Multiband Comp", "use_case": "Multiband compression"},
    {"name": "Freq Split FX", "use_case": "Creative frequency effects"}
  ]
}
```

## Production Tips

1. **Rate Limiting**: Add rate limiting to prevent API overuse
2. **Error Handling**: Monitor failed executions and retry logic
3. **Data Validation**: Ensure rack data quality before AI analysis
4. **Search Optimization**: Regularly review and optimize searchable content
5. **User Feedback**: Collect user feedback to improve AI prompts
