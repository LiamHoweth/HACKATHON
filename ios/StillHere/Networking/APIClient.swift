// async/await client for the Still Here backend. Never logs the access code or message text.
import Foundation

struct APIClient: Sendable {
    static let accessHeader = "x-still-here-access"

    let baseURL: URL
    let accessCode: String?
    let session: URLSession

    init?(baseURL raw: String, accessCode: String?, session: URLSession = APIClient.defaultSession) {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines).trimmingCharacters(in: CharacterSet(charactersIn: "/"))
        guard let url = URL(string: trimmed), let scheme = url.scheme, ["http", "https"].contains(scheme), url.host != nil else { return nil }
        self.baseURL = url
        self.accessCode = (accessCode?.isEmpty ?? true) ? nil : accessCode
        self.session = session
    }

    static let defaultSession: URLSession = {
        let c = URLSessionConfiguration.ephemeral
        c.timeoutIntervalForRequest = 20
        c.timeoutIntervalForResource = 30
        c.requestCachePolicy = .reloadIgnoringLocalCacheData
        c.urlCache = nil
        return URLSession(configuration: c)
    }()

    private func request(_ path: String, method: String) -> URLRequest {
        var r = URLRequest(url: baseURL.appending(path: path))
        r.httpMethod = method
        r.timeoutInterval = 20
        if let accessCode { r.setValue(accessCode, forHTTPHeaderField: Self.accessHeader) }
        return r
    }

    func status() async -> Result<ServerStatus, APIErrorInfo> {
        do {
            let (data, response) = try await session.data(for: request("api/status", method: "GET"))
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                return .failure(APIErrorInfo(code: .providerUnavailable, message: "The server did not answer the status check.", recoverable: true))
            }
            return .success(try JSONDecoder().decode(ServerStatus.self, from: data))
        } catch {
            return .failure(Self.map(error))
        }
    }

    func replies(_ body: ReplyRequest) async -> Result<ReplyResponseData, APIErrorInfo> {
        var r = request("api/replies", method: "POST")
        r.setValue("application/json", forHTTPHeaderField: "Content-Type")
        do {
            r.httpBody = try JSONEncoder().encode(body)
            let (data, _) = try await session.data(for: r)
            return Self.decodeResult(ReplyResponseData.self, data)
        } catch {
            return .failure(Self.map(error))
        }
    }

    func transcribe(fileURL: URL, captureID: String, sessionEpoch: String) async -> Result<TranscriptData, APIErrorInfo> {
        let boundary = "StillHere-\(UUID().uuidString)"
        var r = request("api/transcribe", method: "POST")
        r.timeoutInterval = 30
        r.setValue("multipart/form-data; boundary=\(boundary)", forHTTPHeaderField: "Content-Type")
        do {
            let audio = try Data(contentsOf: fileURL)
            guard audio.count <= 4_000_000 else {
                return .failure(APIErrorInfo(code: .invalidInput, message: "The recording is too large. Type instead.", recoverable: false))
            }
            var body = Data()
            func field(_ name: String, _ value: String) {
                body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"\(name)\"\r\n\r\n\(value)\r\n".data(using: .utf8)!)
            }
            field("captureId", captureID)
            field("sessionEpoch", sessionEpoch)
            body.append("--\(boundary)\r\nContent-Disposition: form-data; name=\"audio\"; filename=\"partner.m4a\"\r\nContent-Type: audio/mp4\r\n\r\n".data(using: .utf8)!)
            body.append(audio)
            body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
            let (data, _) = try await session.upload(for: r, from: body)
            return Self.decodeResult(TranscriptData.self, data)
        } catch {
            return .failure(Self.map(error))
        }
    }

    static func decodeResult<T: Decodable & Sendable>(_: T.Type, _ data: Data) -> Result<T, APIErrorInfo> {
        do {
            return try JSONDecoder().decode(APIResult<T>.self, from: data).result
        } catch {
            return .failure(APIErrorInfo(code: .providerUnavailable, message: "The server sent an unexpected response.", recoverable: true))
        }
    }

    static func map(_ error: Error) -> APIErrorInfo {
        if error is CancellationError { return APIErrorInfo(code: .network, message: "Cancelled.", recoverable: true) }
        if let u = error as? URLError {
            switch u.code {
            case .timedOut: return APIErrorInfo(code: .timeout, message: "The request timed out.", recoverable: true)
            case .cancelled: return APIErrorInfo(code: .network, message: "Cancelled.", recoverable: true)
            default: return APIErrorInfo(code: .network, message: "Can't reach the Still Here server.", recoverable: true)
            }
        }
        return APIErrorInfo(code: .network, message: "Can't reach the Still Here server.", recoverable: true)
    }
}
