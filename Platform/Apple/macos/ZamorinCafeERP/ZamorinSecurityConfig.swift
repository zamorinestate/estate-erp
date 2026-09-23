import Foundation

/// ZAMORIN CAFÉ ERP — macOS SECURITY & ORIGIN GOVERNANCE
/// Enforces HTTPS production origins, App Sandbox boundaries, and Universal Link parsing.
public struct ZamorinSecurityConfig {
    public static let productionHost = "zamorin-cafe-erp.vercel.app"
    public static let altProductionHost = "zamorin.app"
    public static let backendHost = "zamorin-cafe-erp-backend.onrender.com"
    public static let productionBaseUrl = "https://\(productionHost)"

    public static let productionOrigins: Set<String> = [
        "https://\(productionHost)",
        "https://\(altProductionHost)",
        "https://\(backendHost)"
    ]

    public static let debugOrigins: Set<String> = [
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ]

    public static func isAllowedOrigin(url: URL?, isDebug: Bool = false) -> Bool {
        guard let url = url, let host = url.host?.lowercased(), let scheme = url.scheme?.lowercased() else {
            return false
        }

        if scheme == "https" {
            return host == productionHost || host == altProductionHost || host == backendHost
        }

        if isDebug && scheme == "http" {
            let portStr = url.port != nil ? ":\(url.port!)" : ""
            let origin = "http://\(host)\(portStr)"
            return debugOrigins.contains(origin)
        }

        return false
    }

    public static func parseCafeLoginReference(url: URL?) -> String? {
        guard let url = url, let host = url.host?.lowercased(), url.scheme?.lowercased() == "https" else {
            return nil
        }
        guard host == productionHost || host == altProductionHost else {
            return nil
        }

        let segments = url.pathComponents.filter { $0 != "/" }
        if segments.count >= 3 &&
            segments[0].caseInsensitiveCompare("cafe") == .orderedSame &&
            segments[2].caseInsensitiveCompare("login") == .orderedSame {
            let ref = segments[1].trimmingCharacters(in: .whitespacesAndNewlines)
            let regex = try? NSRegularExpression(pattern: "^[A-Za-z0-9_-]{3,64}$")
            let range = NSRange(location: 0, length: ref.utf16.count)
            if regex?.firstMatch(in: ref, options: [], range: range) != nil {
                return ref
            }
        }
        return nil
    }

    public static func buildCafeLoginUrl(publicRef: String, isDebug: Bool = false) -> URL {
        let base = isDebug ? "http://localhost:3000" : productionBaseUrl
        return URL(string: "\(base)/cafe/\(publicRef)/login")!
    }
}
