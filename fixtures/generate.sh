#!/usr/bin/env bash
# Regenerates the tiny test fixtures in fixtures/media and their ffprobe JSON in fixtures/probes.
# Requires a native ffmpeg/ffprobe (with libx264, libx265, prores_ks, libvpx-vp9, libopus, libwebp)
# and Node. Deterministic: synthetic sources, fixed durations, no timestamps in metadata.
#
# Contributors normally don't need to run this — the outputs are committed.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p media probes tmp

FF="ffmpeg -hide_banner -loglevel error -y"
VSRC="-f lavfi -i testsrc2=size=320x180:rate=30:duration=2"
ASRC="-f lavfi -i sine=frequency=440:sample_rate=48000:duration=2"
# Strip the encoder tag so probes stay stable across ffmpeg versions.
NOENC="-fflags +bitexact -flags:v +bitexact -flags:a +bitexact -map_metadata -1"

echo "▶ video fixtures"
$FF $VSRC $ASRC $NOENC -c:v libx264 -preset ultrafast -crf 30 -pix_fmt yuv420p -c:a aac -b:a 64k -movflags +faststart media/h264-ok.mp4
$FF $VSRC $ASRC $NOENC -c:v libx264 -preset ultrafast -crf 30 -pix_fmt yuv420p -c:a aac -b:a 64k media/not-faststart.mp4
$FF $VSRC $ASRC $NOENC -c:v libx265 -preset ultrafast -crf 30 -pix_fmt yuv420p -tag:v hvc1 -c:a aac -b:a 64k media/hevc.mov
# ProRes and PCM are large per second; use a smaller frame / shorter clip to stay under 200 KB.
$FF -f lavfi -i testsrc2=size=160x90:rate=30:duration=1 -f lavfi -i sine=frequency=440:sample_rate=48000:duration=1 $NOENC -c:v prores_ks -profile:v 0 -pix_fmt yuv422p10le -c:a aac -b:a 64k media/prores.mov
$FF $VSRC $ASRC $NOENC -c:v libx264 -preset ultrafast -crf 30 -pix_fmt yuv422p -c:a aac -b:a 64k -movflags +faststart media/yuv422.mp4
# testsrc2 rounds sizes to even; the `color` source does not, and VP9 accepts odd dimensions.
$FF -f lavfi -i color=c=red:size=321x181:rate=30:duration=1 -f lavfi -i sine=frequency=440:sample_rate=48000:duration=1 $NOENC -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -crf 40 -b:v 0 -pix_fmt yuv420p -c:a aac -b:a 64k -movflags +faststart media/odd-dims.mp4
$FF -f lavfi -i testsrc2=size=160x90:rate=30:duration=1 -f lavfi -i sine=frequency=440:sample_rate=48000:duration=1 $NOENC -c:v libx264 -preset ultrafast -crf 30 -pix_fmt yuv420p -c:a pcm_s16le media/pcm-audio.mov
$FF $VSRC $ASRC $NOENC -c:v libvpx-vp9 -deadline realtime -cpu-used 8 -crf 40 -b:v 0 -c:a libopus -b:a 48k media/vp9.webm
$FF $VSRC $ASRC $NOENC -c:v libx264 -preset ultrafast -crf 30 -pix_fmt yuv420p -c:a aac -b:a 64k media/h264.mkv
$FF $VSRC $NOENC -c:v libx264 -preset ultrafast -crf 30 -pix_fmt yuv420p -an -movflags +faststart media/no-audio.mp4
# Rotation: re-mux h264-ok with a 90° display matrix (no re-encode).
$FF -display_rotation 90 -i media/h264-ok.mp4 -c copy -movflags +faststart media/rotated.mp4
# GPS + device metadata in a MOV (QuickTime keys). Uses metadata tags, so drop NOENC here.
$FF $VSRC $ASRC -fflags +bitexact -flags:v +bitexact -flags:a +bitexact \
  -c:v libx264 -preset ultrafast -crf 30 -pix_fmt yuv420p -c:a aac -b:a 64k \
  -metadata location="+37.7749-122.4194/" \
  -metadata com.apple.quicktime.location.ISO6709="+37.7749-122.4194/" \
  -metadata make="MediaLint Test Camera" -metadata model="ML-1000" \
  -metadata com.apple.quicktime.make="MediaLint Test Camera" -metadata com.apple.quicktime.model="ML-1000" \
  -movflags +faststart+use_metadata_tags media/gps.mov

echo "▶ image fixtures"
$FF -f lavfi -i testsrc2=size=320x180:rate=1:duration=1 -frames:v 1 -q:v 8 tmp/plain.jpg
cp tmp/plain.jpg media/plain.jpg
node inject-exif.mjs tmp/plain.jpg media/gps.jpg --orientation 1
node inject-exif.mjs tmp/plain.jpg media/orient6.jpg --orientation 6 --no-gps
$FF -f lavfi -i testsrc2=size=64x64:rate=1:duration=1 -frames:v 1 -pix_fmt rgb48be media/16bit.png
$FF -f lavfi -i testsrc2=size=64x64:rate=1:duration=1 -frames:v 1 -pix_fmt rgba media/alpha.png
$FF -f lavfi -i testsrc2=size=8200x64:rate=1:duration=1 -frames:v 1 -c:v libwebp -quality 30 -pix_fmt yuv420p media/big.webp
$FF -f lavfi -i testsrc2=size=320x180:rate=1:duration=1 -frames:v 1 -c:v libwebp -quality 60 -pix_fmt yuv420p media/plain.webp
# Extension mismatch: a real PNG saved with a .jpg extension.
cp media/alpha.png media/actually-png.jpg

echo "▶ ffprobe JSON"
for f in media/*.mp4 media/*.mov media/*.mkv media/*.webm; do
  name=$(basename "$f")
  ffprobe -v error -print_format json -show_format -show_streams "$f" > "probes/${name}.json"
done

rm -rf tmp
echo "▶ sizes"
ls -la media | awk 'NR>1 {print $5"\t"$9}'
