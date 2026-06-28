# Example: Research Fix Command

```text
/research-fix VoxCPM CMake build passes but generated output.wav is high frequency noise on Windows. Search local records, official docs/source, GitHub issues, and community posts. Produce candidate fixes, try one at a time, and record success/failure.
```

Expected behavior:

1. Search `.opencode/memory/*` for VoxCPM/CMake/audio/noise.
2. Inspect local code and current failing output.
3. Search official/upstream docs or issues when needed.
4. Propose methods such as sample rate mismatch, PCM normalization, mel/vocoder shape mismatch, endian/float conversion, model asset path mismatch.
5. Try one method, verify output and logs, then record the result.
