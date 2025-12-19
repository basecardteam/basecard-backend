/**
 * Generic API Response
 * spec.md에 정의된 표준 응답 포맷
 */
export interface ApiResponse<T> {
  success: boolean;
  result: T | null;
  error: string | null;
}
