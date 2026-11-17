#!/bin/sh
# Turns the Higgsfield clips in assets-src/hf into seamless web loops in public/media.
#
# Each 5 s clip becomes a 4 s loop: the last second dissolves into the clip's own
# first second, so the end frame matches the start frame and the loop has no jump.
# Output is H.264 MP4 (plays everywhere), no audio, faststart, plus a WebP poster
# taken from the loop's first frame so the poster and frame 0 match exactly.
#
# Needs ffmpeg + cwebp (Homebrew). Run from the repo root: sh scripts/encode-media.sh
set -eu

SRC=assets-src/hf
OUT=public/media
mkdir -p "$OUT"

loop() { # loop <src.mp4> <out-name> <width> <crf>
  in="$SRC/$1"; name="$2"; w="$3"; crf="$4"
  ffmpeg -loglevel error -y -i "$in" -filter_complex "\
    [0:v]split[a][b];\
    [a]trim=start=1:end=5,setpts=PTS-STARTPTS[a1];\
    [b]trim=start=0:end=1,setpts=PTS-STARTPTS[b1];\
    [a1][b1]xfade=transition=fade:duration=1:offset=3,scale=${w}:-2:flags=lanczos,format=yuv420p[v]" \
    -map "[v]" -an -c:v libx264 -preset slow -crf "$crf" -profile:v high -movflags +faststart \
    -r 24 "$OUT/$name.mp4"
  ffmpeg -loglevel error -y -i "$OUT/$name.mp4" -frames:v 1 "$OUT/$name.png"
  cwebp -quiet -q 80 "$OUT/$name.png" -o "$OUT/$name.webp"
  rm "$OUT/$name.png"
  printf '%-22s %s\n' "$name" "$(du -h "$OUT/$name.mp4" | cut -f1)"
}

bounce() { # bounce <src.mp4> <out-name> <width> <crf>
  # Forward then reverse over the calmer first 3.2 s of the clip. Used where the camera
  # zooms on text (the battery label): a crossfade would show two labels mid-dissolve.
  in="$SRC/$1"; name="$2"; w="$3"; crf="$4"
  ffmpeg -loglevel error -y -i "$in" -filter_complex "\
    [0:v]trim=start=0.2:end=3.4,setpts=PTS-STARTPTS,split[f][r];\
    [r]reverse,trim=start_frame=1:end_frame=76,setpts=PTS-STARTPTS[rv];\
    [f][rv]concat=n=2:v=1:a=0,scale=${w}:-2:flags=lanczos,format=yuv420p[v]" \
    -map "[v]" -an -c:v libx264 -preset slow -crf "$crf" -profile:v high -movflags +faststart \
    -r 24 "$OUT/$name.mp4"
  ffmpeg -loglevel error -y -i "$OUT/$name.mp4" -frames:v 1 "$OUT/$name.png"
  cwebp -quiet -q 82 "$OUT/$name.png" -o "$OUT/$name.webp"
  rm "$OUT/$name.png"
  printf '%-22s %s\n' "$name" "$(du -h "$OUT/$name.mp4" | cut -f1)"
}

whole() { # whole <src.mp4> <out-name> <width> <crf>
  # For clips generated with the same first and last frame (locked camera): already a
  # seamless loop, so keep every frame except the last (it repeats the first).
  in="$SRC/$1"; name="$2"; w="$3"; crf="$4"
  n=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$in")
  ffmpeg -loglevel error -y -i "$in" -vf "trim=end_frame=$((n - 1)),setpts=PTS-STARTPTS,scale=${w}:-2:flags=lanczos,format=yuv420p" \
    -an -c:v libx264 -preset slow -crf "$crf" -profile:v high -movflags +faststart -r 24 "$OUT/$name.mp4"
  ffmpeg -loglevel error -y -i "$OUT/$name.mp4" -frames:v 1 "$OUT/$name.png"
  cwebp -quiet -q 82 "$OUT/$name.png" -o "$OUT/$name.webp"
  rm "$OUT/$name.png"
  printf '%-22s %s\n' "$name" "$(du -h "$OUT/$name.mp4" | cut -f1)"
}

sway() { # sway <src.mp4> <out-name> <width> <crf>
  # Whole clip forward, then backward: a camera that slides one way and drifts back,
  # never a cut or a dissolve. The repeated frames at each turn are dropped.
  in="$SRC/$1"; name="$2"; w="$3"; crf="$4"
  n=$(ffprobe -v error -count_frames -select_streams v:0 -show_entries stream=nb_read_frames -of csv=p=0 "$in")
  ffmpeg -loglevel error -y -i "$in" -filter_complex "\
    [0:v]split[f][r];\
    [r]reverse,trim=start_frame=1:end_frame=$((n - 1)),setpts=PTS-STARTPTS[rv];\
    [f][rv]concat=n=2:v=1:a=0,scale=${w}:-2:flags=lanczos,format=yuv420p[v]" \
    -map "[v]" -an -c:v libx264 -preset slow -crf "$crf" -profile:v high -movflags +faststart -r 24 "$OUT/$name.mp4"
  ffmpeg -loglevel error -y -i "$OUT/$name.mp4" -frames:v 1 "$OUT/$name.png"
  cwebp -quiet -q 82 "$OUT/$name.png" -o "$OUT/$name.webp"
  rm "$OUT/$name.png"
  printf '%-22s %s\n' "$name" "$(du -h "$OUT/$name.mp4" | cut -f1)"
}

# Full-bleed backgrounds: a desktop and a mobile size.
# Hero: Keegan, 17 Nov: no zooming on the battery, but the page needs movement.
# Desktop: the camera arcs sideways around the battery and back (it also pushes in ~14%,
# which a full-width frame hides). Phones: the locked-camera clip, because on a narrow
# crop that push-in reads as the battery growing (Keegan flagged it on his phone).
sway  v-hero-slide.mp4  hero-1920    1920 24
whole v-hero-static.mp4 hero-m-1280  1280 28
loop v-crystal.mp4   crystal-1920  1920 26
loop v-crystal.mp4   crystal-1280  1280 27
[ -f "$SRC/v-gulf.mp4" ] && loop v-gulf.mp4 gulf-1920 1920 26 && loop v-gulf.mp4 gulf-1280 1280 27

# Core industries (homepage tabs). Each clip gets a desktop and a mobile size.
for k in renewable telecom utilities rail mobility industrial marine; do
  [ -f "$SRC/v-ind-$k.mp4" ] || continue
  loop "v-ind-$k.mp4" "ind-$k-1600" 1600 26
  loop "v-ind-$k.mp4" "ind-$k-960" 960 27
done

# Open Graph image from the hero still (1200x630).
if [ -f "$SRC/hero-battery.png" ]; then
  ffmpeg -loglevel error -y -i "$SRC/hero-battery.png" \
    -vf "scale=1200:-2:flags=lanczos,crop=1200:630" -q:v 3 public/images/og-default.jpg
fi
