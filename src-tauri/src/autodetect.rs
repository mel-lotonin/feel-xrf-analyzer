use base64::Engine;
use opencv::core::{AlgorithmHint, Size, CV_32FC1, CV_8UC1, NORM_MINMAX};
use opencv::prelude::*;
use opencv::{imgcodecs, imgproc};
use std::collections::HashMap;

fn opencv_to_png(mat: &Mat) -> opencv::Result<String> {
    let mut mat2 = Mat::default();
    mat.convert_to(&mut mat2, CV_8UC1, 255.0, 0.0)?;
    let mut buf = opencv::core::Vector::<u8>::new();
    imgcodecs::imencode(".png", &mat2, &mut buf, &opencv::core::Vector::new())?;

    // Convert Vec<u8> to base64 string
    let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);

    // Return data URL string
    Ok(format!("data:image/png;base64,{}", b64))
}

#[tauri::command]
pub fn analyze_map(map: Vec<Vec<f32>>) -> Result<HashMap<String, String>, String> {
    let mut results = HashMap::new();

    let width = map[0].len();
    let height = map.len();

    let flat_map: Vec<f32> = map.into_iter().flatten().collect();
    let raw_img = Mat::new_rows_cols_with_data(
        height as i32,
        width as i32,
        flat_map.as_slice(),
    ).map_err(|e| e.to_string())?
        .clone_pointee();

    let mut normalized = Mat::default();
    let mut gaussian = Mat::default();

    opencv::core::normalize(&raw_img, &mut normalized, 0.0, 1.0, NORM_MINMAX, CV_32FC1, &opencv::core::no_array()).map_err(|e| e.to_string())?;
    imgproc::gaussian_blur(&normalized, &mut gaussian, Size::new(5, 5), 1.0, 0.0, i32::from(opencv::core::BorderTypes::BORDER_CONSTANT), AlgorithmHint::ALGO_HINT_ACCURATE).map_err(|e| e.to_string())?;

    let mut u8_img = Mat::default();
    gaussian.convert_to(&mut u8_img, CV_8UC1, 255.0, 0.0).map_err(|e| e.to_string())?;

    results.insert(String::from("Normalized"), opencv_to_png(&normalized).map_err(|e| e.to_string())?);
    results.insert(String::from("Gaussian"), opencv_to_png(&gaussian).map_err(|e| e.to_string())?);

    Ok(results)
}