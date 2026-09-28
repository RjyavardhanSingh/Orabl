export class ApiError extends Error {
  status: number
  requestId?: string

  constructor(message: string, status: number, requestId?: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.requestId = requestId
  }
}

/** Authentication failed (expired/invalid token). UI should route to sign-in. */
export class AuthError extends ApiError {
  constructor(message = 'Your session has expired. Please sign in again.', requestId?: string) {
    super(message, 401, requestId)
    this.name = 'AuthError'
  }
}
