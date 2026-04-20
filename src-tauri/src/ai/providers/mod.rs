use std::sync::Arc;

use super::AIProvider;

pub mod google;

pub use google::GoogleProvider;

pub fn build_default_providers() -> Vec<Arc<dyn AIProvider>> {
    vec![
        Arc::new(GoogleProvider::new()),
    ]
}
