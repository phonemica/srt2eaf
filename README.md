# SRT to ELAN Converter

A simple Node-based command linetool that converts SRT subtitle files to ELAN annotation format (`.eaf`). Supports both single file conversion and batch processing of multiple SRT files into a single ELAN project with separate tiers. This was created to merge `.srt` files in cases where original ELAN files may have been lost.

It is meant to be straightforward, without the need to set extra flags. Just put time-alined subtitle files in the `./input` folder, run the script witih Node, and the `./output` folder should have your combined ELAN file. See below for more details on installing and running the script.

This script was created for the [Centre for Cultural-Linguistic Diversity](https://ccld-eh.org/) as part of the _Training and Resources for Indigenous Community Linguists_ (TRICL) and _FeLlowships for Indigenous Community Researchers_ (FLICR) programmes.

## Features

- Convert multiple SRT files into one ELAN file with separate tiers
- Handles various SRT formats including 2-digit and 3-digit milliseconds
- Preserves empty subtitle entries
- Automatic output file generation with timestamps
- Support for media file references in ELAN projects

## Requirements

- Node.js
- `glob` package for file discovery

## Installation

1. Clone or download this repository
2. Install dependencies:
   ```bash
   npm install glob
   ```

## Usage

### Basic Usage

Place your SRT files in the `input` folder and run:

```bash
node srt2eaf.js
```

This will:
- Process all SRT files in `./input/`
- Create an ELAN file in `./output/` with timestamp-based filename
- Generate separate tiers for each SRT file

### Advanced Options

```bash
# Specify input directory
node srt2eaf.js --dir=./subtitles

# Specify output file
node srt2eaf.js --output=./results/project.eaf

# Include media file reference
node srt2eaf.js --media=video.mp4

# Convert single file only
node srt2eaf.js --single=movie.srt

# Set author name
node srt2eaf.js --author="Your Name"

# Preserve HTML formatting in text
node srt2eaf.js --preserve-format

# Enable strict validation with warnings
node srt2eaf.js --strict

# Set file encoding
node srt2eaf.js --encoding=utf8
```

### Combined Example

```bash
node srt2eaf.js --dir=./subtitles --output=./project.eaf --media=movie.mp4 --author="John Doe"
```

## File Structure

```
your-project/
├── input/           # Place your SRT files here
├── output/          # Generated ELAN files appear here
└── srt2eaf.js       # The converter script
```

## SRT Format Support

The converter handles various SRT formats:
- Standard timestamps: `00:01:23,456`
- Short milliseconds: `00:01:23,45` (automatically padded)
- Empty subtitle entries (preserved as empty)
- HTML tags (removed by default, unless `--preserve-format` is used)

## Output

Creates ELAN (.eaf) files with:
- Separate tier for each input SRT file
- Proper time alignment
- Optional media file references
- Standard ELAN format compatible with ELAN software

## Error Handling

The converter will:
- Skip malformed subtitle entries with warnings
- Continue processing valid entries even if some fail
- Provide clear error messages for file or parsing issues
- Show final conversion summary

## Help

```bash
node srt2eaf.js --help
```

## License

Creative Commons Attribution 4.0