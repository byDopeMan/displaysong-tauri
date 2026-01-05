use crate::spotify::ColorInfo;

pub async fn extract_from_url(url: &str) -> Result<ColorInfo, String> {
    let response = reqwest::get(url).await
        .map_err(|e| format!("Download failed: {}", e))?;
    
    let bytes = response.bytes().await
        .map_err(|e| format!("Read failed: {}", e))?;
    
    let img = image::load_from_memory(&bytes)
        .map_err(|e| format!("Image decode failed: {}", e))?;
    
    let rgb = img.to_rgb8();
    let (width, height) = rgb.dimensions();
    
    // Sample from center region
    let mut r_sum: u64 = 0;
    let mut g_sum: u64 = 0;
    let mut b_sum: u64 = 0;
    let mut count: u64 = 0;
    
    let start_x = width / 4;
    let end_x = 3 * width / 4;
    let start_y = height / 4;
    let end_y = 3 * height / 4;
    
    for y in (start_y..end_y).step_by(4) {
        for x in (start_x..end_x).step_by(4) {
            let pixel = rgb.get_pixel(x, y);
            r_sum += pixel[0] as u64;
            g_sum += pixel[1] as u64;
            b_sum += pixel[2] as u64;
            count += 1;
        }
    }
    
    if count == 0 {
        return Ok(ColorInfo { r: 0, g: 0, b: 0 }); // Spotify green default
    }
    
    let r = (r_sum / count) as u8;
    let g = (g_sum / count) as u8;
    let b = (b_sum / count) as u8;
    
    // Boost saturation slightly
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    
    if max == min || max < 30 {
        return Ok(ColorInfo { r: 0, g: 0, b: 0 });
    }
    
    Ok(ColorInfo { r, g, b })
}
