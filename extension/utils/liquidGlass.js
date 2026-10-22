// Fixed native blur settings for the experimental popup glass surfaces.
// Sigma 10 is downscaled to about 5 for this wide popup, keeping the blur soft.
export const LIQUID_GLASS_BLUR_RADIUS = 10;
export const LIQUID_GLASS_BLUR_BRIGHTNESS = 0.92;

export function readLiquidGlassSettings(settings) {
    try {
        return { enabled: settings?.get_boolean('liquid-glass-enabled') ?? false };
    } catch (_error) {
        // Older or incomplete schemas retain the standard popup appearance.
        return { enabled: false };
    }
}
