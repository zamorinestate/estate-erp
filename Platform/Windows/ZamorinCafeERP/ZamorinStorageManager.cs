using System;
using System.IO;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace Zamorin.Cafe.ERP
{
    /// <summary>
    /// ZAMORIN CAFÉ ERP — WINDOWS STORAGE ACCESS & DIRECTORY MANAGER
    /// Implements Section 17 & 18 user-selected destination access and ZAMORIN ERP hierarchy.
    /// </summary>
    public static class ZamorinStorageManager
    {
        public class WriteResult
        {
            public bool Success { get; set; }
            public string? FilePath { get; set; }
            public string Filename { get; set; } = string.Empty;
            public long BytesWritten { get; set; }
            public string? ErrorCode { get; set; }
            public string? ErrorMessage { get; set; }
        }

        public static string SanitizeFilename(string filename)
        {
            var invalidChars = new string(Path.GetInvalidFileNameChars());
            var pattern = "[" + Regex.Escape(invalidChars) + "]";
            var clean = Regex.Replace(filename.Trim(), pattern, "_");
            return string.IsNullOrWhiteSpace(clean) ? "zamorin_export" : clean;
        }

        public static bool IsPathTraversal(string subfolder)
        {
            if (string.IsNullOrWhiteSpace(subfolder)) return false;
            var normalized = subfolder.Replace('\\', '/');
            return normalized.Contains("..") || normalized.StartsWith("/") || normalized.StartsWith("~");
        }

        public static string GetOrCreateSubDirectory(string rootDirectory, string subfolderPath)
        {
            if (!Directory.Exists(rootDirectory))
            {
                throw new DirectoryNotFoundException($"Selected root directory does not exist: {rootDirectory}");
            }

            if (IsPathTraversal(subfolderPath))
            {
                throw new UnauthorizedAccessException("Path traversal outside user-authorized directory is prohibited.");
            }

            var cleanPath = subfolderPath.Trim().Replace('/', Path.DirectorySeparatorChar);
            var targetDir = Path.Combine(rootDirectory, cleanPath);

            var fullTarget = Path.GetFullPath(targetDir);
            var fullRoot = Path.GetFullPath(rootDirectory);

            if (!fullTarget.StartsWith(fullRoot, StringComparison.OrdinalIgnoreCase))
            {
                throw new UnauthorizedAccessException("Target path is outside the authorized root directory.");
            }

            if (!Directory.Exists(fullTarget))
            {
                Directory.CreateDirectory(fullTarget);
            }

            return fullTarget;
        }

        public static async Task<WriteResult> WriteDocumentAsync(
            string rootDirectory,
            string subfolderPath,
            string filename,
            byte[] data)
        {
            try
            {
                var sanitizedName = SanitizeFilename(filename);
                var targetDir = GetOrCreateSubDirectory(rootDirectory, subfolderPath);
                var targetFile = Path.Combine(targetDir, sanitizedName);

                await File.WriteAllBytesAsync(targetFile, data);

                return new WriteResult
                {
                    Success = true,
                    FilePath = targetFile,
                    Filename = sanitizedName,
                    BytesWritten = data.Length
                };
            }
            catch (UnauthorizedAccessException ex)
            {
                return new WriteResult
                {
                    Success = false,
                    ErrorCode = "UNAUTHORIZED_DIRECTORY_ACCESS",
                    ErrorMessage = ex.Message
                };
            }
            catch (Exception ex)
            {
                return new WriteResult
                {
                    Success = false,
                    ErrorCode = "STORAGE_WRITE_ERROR",
                    ErrorMessage = ex.Message
                };
            }
        }
    }
}
