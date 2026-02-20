use axum::{http::StatusCode, response::{IntoResponse, Response}, Json};
use serde::Serialize;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug)]
pub struct AppError(pub anyhow::Error);

impl<E> From<E> for AppError
where
    E: Into<anyhow::Error>,
{
    fn from(value: E) -> Self {
        Self(value.into())
    }
}

#[derive(Serialize)]
struct ErrorPayload {
    error: String,
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let message = self.0.to_string();
        let lowered = message.to_lowercase();

        let status = if lowered.contains("missing") || lowered.contains("invalid") || lowered.contains("required") {
            StatusCode::BAD_REQUEST
        } else {
            StatusCode::INTERNAL_SERVER_ERROR
        };

        (status, Json(ErrorPayload { error: message })).into_response()
    }
}
