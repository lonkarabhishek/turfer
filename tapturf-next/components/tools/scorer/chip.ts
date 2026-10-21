/** A ball chip's text: "." (a dot ball) reads as 0. Its own module so the shared sheet UI does not load the cricket engine. */
export const chipText = (chip: string) => (chip === "." ? "0" : chip);
