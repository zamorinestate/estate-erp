import Foundation

/// ZAMORIN CAFÉ ERP — iOS DOCUMENT & EXPORT MANAGER
/// Implements Section 5 & 6 security-scoped resource access and file coordination.
public class ZamorinDocumentManager {
    public static let shared = ZamorinDocumentManager()

    public struct WriteResult {
        public let success: Bool
        public let filePath: String?
        public let filename: String
        public let bytesWritten: Int
        public let errorCode: String?
        public let errorMessage: String?
    }

    private var activeSecurityScopedUrl: URL?

    public func setSecurityScopedDirectory(url: URL) {
        if let existing = activeSecurityScopedUrl {
            existing.stopAccessingSecurityScopedResource()
        }
        if url.startAccessingSecurityScopedResource() {
            activeSecurityScopedUrl = url
        }
    }

    public func getSecurityScopedDirectory() -> URL? {
        return activeSecurityScopedUrl
    }

    public func releaseSecurityScopedDirectory() {
        activeSecurityScopedUrl?.stopAccessingSecurityScopedResource()
        activeSecurityScopedUrl = nil
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
                errorCode: "SECURITY_SCOPED_DIRECTORY_REQUIRED",
                errorMessage: "No user-authorized directory selected via document picker."
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
                errorMessage: "Path traversal outside authorized container is blocked."
            )
        }

        let cleanFilename = filename.components(separatedBy: CharacterSet(charactersIn: "/\\?%*|\"<>:")).joined(separator: "_")
        let targetDirectory = rootUrl.appendingPathComponent(cleanSubfolder, isDirectory: true)

        let coordinator = NSFileCoordinator()
        var coordinationError: NSError?
        var writeError: Error?
        var finalUrl: URL?

        coordinator.coordinate(writingItemAt: targetDirectory, options: .forMerging, error: &coordinationError) { dirUrl in
            do {
                try FileManager.default.createDirectory(at: dirUrl, withIntermediateDirectories: true, attributes: nil)
                let destinationFile = dirUrl.appendingPathComponent(cleanFilename)
                try data.write(to: destinationFile, options: .atomic)
                finalUrl = destinationFile
            } catch {
                writeError = error
            }
        }

        if let error = writeError ?? coordinationError {
            return WriteResult(
                success: false,
                filePath: nil,
                filename: cleanFilename,
                bytesWritten: 0,
                errorCode: "WRITE_FAILED",
                errorMessage: error.localizedDescription
            )
        }

        return WriteResult(
            success: true,
            filePath: finalUrl?.path,
            filename: cleanFilename,
            bytesWritten: data.count,
            errorCode: nil,
            errorMessage: nil
        )
    }

    deinit {
        activeSecurityScopedUrl?.stopAccessingSecurityScopedResource()
    }
}
