use crate::spotify::ColorInfo;
use once_cell::sync::Lazy;
use std::collections::HashMap;
use std::sync::Mutex;

// ============================================================================
// COLOR CACHE - Vermeidet doppelte Downloads
// ============================================================================

const MAX_CACHE_SIZE: usize = 100;

static COLOR_CACHE: Lazy<Mutex<HashMap<String, ColorInfo>>> = 
    Lazy::new(|| Mutex::new(HashMap::with_capacity(MAX_CACHE_SIZE)));

/// Extrahiert die dominante Farbe aus einem Bild (mit Cache)
pub async fn extract_from_url(url: &str) -> Result<ColorInfo, String> {
    // 1. Cache prüfen
    {
        let cache = COLOR_CACHE.lock().unwrap();
        if let Some(color) = cache.get(url) {
            return Ok(color.clone());
        }
    }
    
    // 2. Bild herunterladen und Farbe extrahieren
    let color = extract_color_internal(url).await?;
    
    // 3. In Cache speichern
    {
        let mut cache = COLOR_CACHE.lock().unwrap();
        
        // Cache-Größe begrenzen (einfache LRU-artige Eviction)
        if cache.len() >= MAX_CACHE_SIZE {
            // Ersten Eintrag entfernen (nicht perfekt, aber einfach)
            if let Some(first_key) = cache.keys().next().cloned() {
                cache.remove(&first_key);
            }
        }
        
        cache.insert(url.to_string(), color.clone());
    }
    
    Ok(color)
}

/// Interne Farbextraktion ohne Cache
async fn extract_color_internal(url: &str) -> Result<ColorInfo, String> {
    let response = reqwest::get(url).await
        .map_err(|e| format!("Download failed: {}", e))?;
    
    let bytes = response.bytes().await
        .map_err(|e| format!("Read failed: {}", e))?;
    
    let img = image::load_from_memory(&bytes)
        .map_err(|e| format!("Image decode failed: {}", e))?;
    
    // Kleinere Version für schnellere Verarbeitung
    let img = img.thumbnail(100, 100);
    let rgb = img.to_rgb8();
    let (width, height) = rgb.dimensions();
    
    // Sample aus dem Zentrum für bessere Farberkennung
    let mut r_sum: u64 = 0;
    let mut g_sum: u64 = 0;
    let mut b_sum: u64 = 0;
    let mut count: u64 = 0;
    
    let start_x = width / 4;
    let end_x = 3 * width / 4;
    let start_y = height / 4;
    let end_y = 3 * height / 4;
    
    // Größere Schrittweite für schnellere Verarbeitung
    for y in (start_y..end_y).step_by(2) {
        for x in (start_x..end_x).step_by(2) {
            let pixel = rgb.get_pixel(x, y);
            r_sum += pixel[0] as u64;
            g_sum += pixel[1] as u64;
            b_sum += pixel[2] as u64;
            count += 1;
        }
    }
    
    if count == 0 {
        return Ok(ColorInfo { r: 29, g: 185, b: 84 }); // Spotify green default
    }
    
    let r = (r_sum / count) as u8;
    let g = (g_sum / count) as u8;
    let b = (b_sum / count) as u8;
    
    // Minimale Sättigung prüfen
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    
    if max == min || max < 30 {
        // Zu grau/dunkel - Spotify green als Fallback
        return Ok(ColorInfo { r: 29, g: 185, b: 84 });
    }
    
    // Leichte Sättigungsverstärkung für lebhaftere Farben
    let (r, g, b) = boost_saturation(r, g, b, 1.2);
    
    Ok(ColorInfo { r, g, b })
}

/// Verstärkt die Sättigung einer Farbe
fn boost_saturation(r: u8, g: u8, b: u8, factor: f32) -> (u8, u8, u8) {
    let rf = r as f32 / 255.0;
    let gf = g as f32 / 255.0;
    let bf = b as f32 / 255.0;
    
    let max = rf.max(gf).max(bf);
    let min = rf.min(gf).min(bf);
    let l = (max + min) / 2.0;
    
    if max == min {
        return (r, g, b); // Graustufe
    }
    
    let d = max - min;
    let s = if l > 0.5 { d / (2.0 - max - min) } else { d / (max + min) };
    
    // Sättigung verstärken
    let new_s = (s * factor).min(1.0);
    
    // Zurück zu RGB
    let h = if max == rf {
        (gf - bf) / d + if gf < bf { 6.0 } else { 0.0 }
    } else if max == gf {
        (bf - rf) / d + 2.0
    } else {
        (rf - gf) / d + 4.0
    };
    let h = h / 6.0;
    
    let (r, g, b) = hsl_to_rgb(h, new_s, l);
    
    ((r * 255.0) as u8, (g * 255.0) as u8, (b * 255.0) as u8)
}

fn hsl_to_rgb(h: f32, s: f32, l: f32) -> (f32, f32, f32) {
    if s == 0.0 {
        return (l, l, l);
    }
    
    let q = if l < 0.5 { l * (1.0 + s) } else { l + s - l * s };
    let p = 2.0 * l - q;
    
    let r = hue_to_rgb(p, q, h + 1.0/3.0);
    let g = hue_to_rgb(p, q, h);
    let b = hue_to_rgb(p, q, h - 1.0/3.0);
    
    (r, g, b)
}

fn hue_to_rgb(p: f32, q: f32, mut t: f32) -> f32 {
    if t < 0.0 { t += 1.0; }
    if t > 1.0 { t -= 1.0; }
    
    if t < 1.0/6.0 { return p + (q - p) * 6.0 * t; }
    if t < 1.0/2.0 { return q; }
    if t < 2.0/3.0 { return p + (q - p) * (2.0/3.0 - t) * 6.0; }
    
    p
}

/// Cache leeren
pub fn clear_cache() -> usize {
    let mut cache = COLOR_CACHE.lock().unwrap();
    let size = cache.len();
    cache.clear();
    size
}

/// Cache-Größe abfragen
pub fn cache_size() -> usize {
    let cache = COLOR_CACHE.lock().unwrap();
    cache.len()
}
