using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;

namespace Zamorin.Cafe.ERP
{
    /// <summary>
    /// ZAMORIN CAFÉ ERP — WINDOWS CLIENT SECURITY & ORIGIN ISOLATION
    /// Enforces production origin boundaries, Web-to-App link routing, and safe protocol handling.
    /// </summary>
    public static class ZamorinSecurityConfig
    {
        public const string ProductionHost = "zamorin-cafe-erp.vercel.app";
        public const string AltProductionHost = "zamorin.app";
        public const string BackendHost = "zamorin-cafe-erp-backend.onrender.com";
        public const string ProductionBaseUrl = "https://" + ProductionHost;

        private static readonly HashSet<string> ProductionOrigins = new(StringComparer.OrdinalIgnoreCase)
        {
            "https://" + ProductionHost,
            "https://" + AltProductionHost,
            "https://" + BackendHost
        };

        private static readonly HashSet<string> DebugOrigins = new(StringComparer.OrdinalIgnoreCase)
        {
            "http://localhost:3000",
            "http://localhost:4000",
            "http://127.0.0.1:3000"
        };

        public static bool IsAllowedOrigin(string? url, bool isDebug = false)
        {
            if (string.IsNullOrWhiteSpace(url)) return false;
            if (!Uri.TryCreate(url, UriKind.Absolute, out var uri)) return false;

            var scheme = uri.Scheme.ToLowerInvariant();
            var host = uri.Host.ToLowerInvariant();

            if (scheme == "https")
            {
                return host == ProductionHost || host == AltProductionHost || host == BackendHost;
            }

            if (isDebug && scheme == "http")
            {
                var origin = uri.Port != -1 ? $"http://{host}:{uri.Port}" : $"http://{host}";
                return DebugOrigins.Contains(origin);
            }

            return false;
        }

        public static string? ParseCafeLoginReference(string? urlOrUri)
        {
            if (string.IsNullOrWhiteSpace(urlOrUri)) return null;
            if (!Uri.TryCreate(urlOrUri, UriKind.Absolute, out var uri)) return null;

            var host = uri.Host.ToLowerInvariant();
            if (host != ProductionHost && host != AltProductionHost) return null;
            if (!uri.Scheme.Equals("https", StringComparison.OrdinalIgnoreCase)) return null;

            var segments = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (segments.Length >= 3 &&
                segments[0].Equals("cafe", StringComparison.OrdinalIgnoreCase) &&
                segments[2].Equals("login", StringComparison.OrdinalIgnoreCase))
            {
                var token = segments[1].Trim();
                if (Regex.IsMatch(token, @"^[A-Za-z0-9_-]{3,64}$"))
                {
                    return token;
                }
            }

            return null;
        }

        public static string BuildCafeLoginUrl(string publicRef, bool isDebug = false)
        {
            var baseUri = isDebug ? "http://localhost:3000" : ProductionBaseUrl;
            return $"{baseUri}/cafe/{publicRef}/login";
        }
    }
}
