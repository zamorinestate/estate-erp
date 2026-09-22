import Foundation

/// ZAMORIN CAFÉ ERP — macOS STORAGE & SANDBOX BOOKMARK MANAGER
/// Implements Section 11 & 12 security-scoped bookmarks and App Sandbox compliance.
public class ZamorinMacStorageManager {
    public static let shared = ZamorinMacStorageManager()

    public struct WriteResult {
        public let success: Bool
        public let filePath: String?
        public let filename: String
        public let bytesWritten: Int
        public let errorCode: String?
        public let errorMessage: String?
    }

    private let bookmarkKey = "zamorin_macos_storage_bookmark"
    private var activeSecurityScopedUrl: URL?

    public init() {
        restoreBookmark()
    }

    public func saveBookmark(url: URL) -> Bool {
        if url.startAccessingSecurityScopedResource() {
            activeSecurityScopedUrl?.stopAccessingSecurityScopedResource()
            activeSecurityScopedUrl = url

            do {
                let bookmarkData = try url.bookmarkData(
                    options: .withSecurityScope,
                    includingResourceValuesForKeys: nil,
                    relativeTo: nil
                )
                UserDefaults.standard.set(bookmarkData, forKey: bookmarkKey)
                return true
            } catch {
                return false
            }
        }
        return false
    }

    public func restoreBookmark() {
        guard let bookmarkData = UserDefaults.standard.data(forKey: bookmarkKey) else { return }
        var isStale = false
        do {
            let url = try URL(
                resolvingBookmarkData: bookmarkData,
                options: .withSecurityScope,
                relativeTo: nil,
                bookmarkDataIsStale: &isStale
            )
            if url.startAccessingSecurityScopedResource() {
                activeSecurityScopedUrl = url
                if isStale {
                    _ = saveBookmark(url: url)
                }
            }
        } catch {
            UserDefaults.standard.removeObject(forKey: bookmarkKey)
            activeSecurityScopedUrl = nil
        }
    }

    public func getAuthorizedDirectory() -> URL? {
        return activeSecurityScopedUrl
    }

    public func clearAuthorizedDirectory() {
        activeSecurityScopedUrl?.stopAccessingSecurityScopedResource()
        activeSecurityScopedUrl = nil
        UserDefaults.standard.removeObject(forKey: bookmarkKey)
    }

    public func writeDocument(
        subfolder: String,
        filename: String,
        data: Data
    ) -> WriteResult {
        guard let rootUrl = activeSecurityScopedUrl else {
            return WriteResult(
                success: false,
                filePath: nil,
                filename: filename,
                bytesWritten: 0,
                errorCode: "STORAGE_PERMISSION_REQUIRED",
                errorMessage: "No user-authorized directory configured under macOS App Sandbox."
            )
        }

        let cleanSubfolder = subfolder.replacingOccurrences(of: "\\", with: "/").trimmingCharacters(in: .whitespacesAndNewlines)
        if cleanSubfolder.contains("..") || cleanSubfolder.hasPrefix("/") {
            return WriteResult(
                success: false,
                filePath: nil,
                filename: filename,
                bytesWritten: 0,
                errorCode: "PATH_TRAVERSAL_PROHIBITED",
                errorMessage: "Path traversal outside authorized container is prohibited."
            )
        }

        let cleanFilename = filename.components(separatedBy: CharacterSet(charactersIn: "/\\?%*|\"<>:")).joined(separator: "_")
        let targetDirectory = rootUrl.appendingPathComponent(cleanSubfolder, isDirectory: true)

        do {
            try FileManager.default.createDirectory(at: targetDirectory, withIntermediateDirectories: true, attributes: nil)
            let destinationFile = targetDirectory.appendingPathComponent(cleanFilename)
            try data.write(to: destinationFile, options: .atomic)

            return WriteResult(
                success: true,
                filePath: destinationFile.path,
                filename: cleanFilename,
                bytesWritten: data.count,
                errorCode: nil,
                errorMessage: nil
            )
        } catch {
            return WriteResult(
                success: false,
                filePath: nil,
                filename: cleanFilename,
                bytesWritten: 0,
                errorCode: "WRITE_FAILED",
                errorMessage: error.localizedDescription
            )
        }
    }

    deinit {
        activeSecurityScopedUrl?.stopAccessingSecurityScopedResource()
    }
}
