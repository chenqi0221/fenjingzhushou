use std::sync::Arc;

use super::AIProvider;

pub mod google;
pub mod ppio;
pub mod volcano;
pub mod volcano_vision;

pub use google::GoogleProvider;
pub use ppio::PPIOProvider;
pub use volcano::VolcanoProvider;
pub use volcano_vision::VolcanoVisionProvider;

pub fn build_default_providers() -> Vec<Arc<dyn AIProvider>> {
    vec![
        Arc::new(PPIOProvider::new()),
        Arc::new(VolcanoProvider::new()),
        Arc::new(VolcanoVisionProvider::new()),
        Arc::new(GoogleProvider::new()),
    ]
}
