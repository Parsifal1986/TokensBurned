export const CLIENT_RELEASE = Object.freeze({
  latest_version: "0.5.1",
  minimum_supported_version: "0.4.0",
  update_url: "https://github.com/Parsifal1986/TokensBurned#install",
  check_interval_seconds: 24 * 60 * 60,
});

export function clientRelease() {
  return { ...CLIENT_RELEASE };
}
