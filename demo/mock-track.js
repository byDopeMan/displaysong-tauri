const demoTrack = {
    track: "tattoo",
    artist: "Hank",
    album: "tattoo",
    albumCover: "https://i.scdn.co/image/ab67616d0000b273cd93ce87e22dc948a2b29030",
    isPlaying: true,
    progressMs: 0,
    durationMs: 150000,
    color: { r: 182, g: 189, b: 195 }
};

export function startDemo(updateFn) {
    updateFn(demoTrack);

    setInterval(() => {
        demoTrack.progressMs += 1000;
        if (demoTrack.progressMs > demoTrack.durationMs) {
            demoTrack.progressMs = 0;
        }
        updateFn(demoTrack);
    }, 1000);
}