using System;
using System.Text.Json;
using System.Text;
using System.Security.Cryptography;
using System.Text.Json.Nodes;
using System.Threading.Tasks;

namespace Zamorin.Cafe.ERP
{
    /// <summary>
    /// ZAMORIN CAFÉ ERP — WINDOWS NATIVE MESSAGE BRIDGE
    /// Implements Section 16 & 24 typed request-response protocol for WebView2.
    /// </summary>
    public class ZamorinNativeBridge
    {
        public interface IBridgeCallbacks
        {
            Task<string?> OnRequestDirectoryPickerAsync(string requestId);
            Task<string?> OnOpenFilePickerAsync(string requestId, string? filter);
            Task<bool> OnOpenSystemPrintAsync(string requestId, string jobName);
            Task<bool> OnShareDocumentAsync(string requestId, string filename, byte[] data);
        }

        private readonly IBridgeCallbacks _callbacks;
        private string? _currentExportDirectory;

        public ZamorinNativeBridge(IBridgeCallbacks callbacks)
        {
            _callbacks = callbacks;
        }

        public void SetExportDirectory(string? directoryPath)
        {
            _currentExportDirectory = directoryPath;
        }

        public string? GetExportDirectory() => _currentExportDirectory;

        public async Task<string> HandleMessageAsync(string rawJson)
        {
            string requestId = $"req_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}";
            try
            {
                var doc = JsonNode.Parse(rawJson);
                if (doc == null || doc is not JsonObject json)
                {
                    return CreateResponse(requestId, false, null, "MALFORMED_JSON", "Payload must be a JSON object.");
                }

                requestId = json["requestId"]?.GetValue<string>() ?? requestId;
                var action = json["action"]?.GetValue<string>()?.Trim().ToUpperInvariant() ?? string.Empty;
                var payload = json["payload"] as JsonObject ?? new JsonObject();

                switch (action)
                {
                    case "GET_DEVICE_CAPABILITIES":
                    case "GET_STORAGE_CAPABILITY":
                    {
                        var res = new JsonObject
                        {
                            ["platform"] = "WINDOWS",
                            ["isNative"] = true,
                            ["hasStorageAccess"] = true,
                            ["canChooseDirectory"] = true,
                            ["canPrint"] = true,
                            ["canChooseFile"] = true,
                            ["canShare"] = true,
                            ["currentExportDirectory"] = _currentExportDirectory,
                            ["destinationDisplay"] = !string.IsNullOrEmpty(_currentExportDirectory) ? _currentExportDirectory : "Not Configured"
                        };
                        return CreateResponse(requestId, true, res);
                    }

                    case "SELECT_EXPORT_DIRECTORY":
                    case "CHANGE_EXPORT_DIRECTORY":
                    {
                        var dir = await _callbacks.OnRequestDirectoryPickerAsync(requestId);
                        if (!string.IsNullOrEmpty(dir))
                        {
                            _currentExportDirectory = dir;
                            var res = new JsonObject
                            {
                                ["directory"] = dir,
                                ["destinationDisplay"] = dir
                            };
                            return CreateResponse(requestId, true, res);
                        }
                        var cancelRes = new JsonObject { ["cancelled"] = true };
                        return CreateResponse(requestId, false, cancelRes, "SELECTION_CANCELLED", "User cancelled directory selection.");
                    }

                    case "SAVE_DOCUMENT":
                    {
                        if (string.IsNullOrEmpty(_currentExportDirectory))
                        {
                            return CreateResponse(requestId, false, null, "STORAGE_DESTINATION_REQUIRED", "No destination directory configured. Please select export folder.");
                        }

                        var filename = payload["filename"]?.GetValue<string>() ?? "zamorin_export";
                        var subfolder = payload["subfolder"]?.GetValue<string>() ?? "ZAMORIN ERP/Exports";
                        var base64Data = payload["base64Data"]?.GetValue<string>() ?? string.Empty;

                        byte[] data;
                        try
                        {
                            data = Convert.FromBase64String(base64Data);
                        }
                        catch
                        {
                            return CreateResponse(requestId, false, null, "INVALID_BASE64_DATA", "Document data is not valid base64.");
                        }

                        var writeRes = await ZamorinStorageManager.WriteDocumentAsync(_currentExportDirectory, subfolder, filename, data);
                        if (writeRes.Success)
                        {
                            var res = new JsonObject
                            {
                                ["filePath"] = writeRes.FilePath,
                                ["filename"] = writeRes.Filename,
                                ["bytesWritten"] = writeRes.BytesWritten
                            };
                            return CreateResponse(requestId, true, res);
                        }

                        return CreateResponse(requestId, false, null, writeRes.ErrorCode ?? "WRITE_FAILED", writeRes.ErrorMessage ?? "Failed to write file.");
                    }

                    case "GET_DEVICE_ATTESTATION_KEY":
                    {
                        using var signer = OpenOrCreateAttestationSigner(out var providerLabel);
                        var parameters = signer.ExportParameters(false);
                        var jwk = PublicJwk(parameters);
                        var res = new JsonObject
                        {
                            ["algorithm"] = "ES256",
                            ["provider"] = providerLabel,
                            ["publicKeyJwk"] = jwk,
                            ["keyThumbprint"] = KeyThumbprint(jwk)
                        };
                        return CreateResponse(requestId, true, res);
                    }

                    case "SIGN_DEVICE_ATTESTATION":
                    {
                        return CreateResponse(
                            requestId,
                            false,
                            null,
                            "DEVICE_ATTESTATION_DIRECT_SIGNING_DISABLED",
                            "Arbitrary device-key signing is disabled. Use a purpose-bound attestation action."
                        );
                    }

                    case "OPEN_SYSTEM_PRINT":
                    {
                        var jobName = payload["jobName"]?.GetValue<string>() ?? "Zamorin_Print_Job";
                        var printSuccess = await _callbacks.OnOpenSystemPrintAsync(requestId, jobName);
                        var res = new JsonObject
                        {
                            ["printed"] = false,
                            ["printDispatched"] = printSuccess,
                            ["status"] = printSuccess ? "SYSTEM_DIALOG_OPENED" : "FAILED",
                            ["systemPrintCompleted"] = false,
                            ["spoolerCompletionVerified"] = false,
                            ["contentBindingVerified"] = false,
                            ["printerIdentityVerified"] = false,
                            ["physicalCompletionVerified"] = false,
                            ["printEvidencePolicy"] = "SYSTEM_PRINT_UNVERIFIED",
                            ["jobName"] = jobName
                        };
                        return CreateResponse(requestId, printSuccess, res);
                    }

                    case "OPEN_FILE_PICKER":
                    {
                        var filter = payload["mimeType"]?.GetValue<string>();
                        var selectedFile = await _callbacks.OnOpenFilePickerAsync(requestId, filter);
                        if (!string.IsNullOrEmpty(selectedFile))
                        {
                            var res = new JsonObject { ["filePath"] = selectedFile };
                            return CreateResponse(requestId, true, res);
                        }
                        var cancelRes = new JsonObject { ["cancelled"] = true };
                        return CreateResponse(requestId, false, cancelRes, "FILE_PICKER_CANCELLED", "User cancelled file picker.");
                    }

                    case "SHARE_DOCUMENT":
                    {
                        var filename = payload["filename"]?.GetValue<string>() ?? "share_document";
                        var base64Data = payload["base64Data"]?.GetValue<string>() ?? string.Empty;
                        var bytes = Convert.FromBase64String(base64Data);
                        var shared = await _callbacks.OnShareDocumentAsync(requestId, filename, bytes);
                        var res = new JsonObject { ["shared"] = shared };
                        return CreateResponse(requestId, shared, res);
                    }

                    default:
                    {
                        return CreateResponse(requestId, false, null, "UNKNOWN_NATIVE_ACTION", $"Action '{action}' is not supported on Windows.");
                    }
                }
            }
            catch (Exception ex)
            {
                return CreateResponse(requestId, false, null, "BRIDGE_EXECUTION_ERROR", ex.Message);
            }
        }

        private const string AttestationKeyName = "zamorin_device_attestation_v1";

        private static ECDsaCng OpenOrCreateAttestationSigner(out string providerLabel)
        {
            var providers = new[]
            {
                (Provider: new CngProvider("Microsoft Platform Crypto Provider"), Label: "WINDOWS_CNG"),
                (Provider: CngProvider.MicrosoftSoftwareKeyStorageProvider, Label: "WINDOWS_CNG")
            };

            Exception? lastError = null;
            foreach (var candidate in providers)
            {
                try
                {
                    CngKey key;
                    if (CngKey.Exists(AttestationKeyName, candidate.Provider))
                    {
                        key = CngKey.Open(AttestationKeyName, candidate.Provider);
                    }
                    else
                    {
                        key = CngKey.Create(
                            CngAlgorithm.ECDsaP256,
                            AttestationKeyName,
                            new CngKeyCreationParameters
                            {
                                Provider = candidate.Provider,
                                KeyUsage = CngKeyUsages.Signing,
                                ExportPolicy = CngExportPolicies.None
                            }
                        );
                    }
                    providerLabel = candidate.Label;
                    return new ECDsaCng(key);
                }
                catch (Exception ex)
                {
                    lastError = ex;
                }
            }

            throw new CryptographicException("Unable to initialize persistent Windows CNG signing key.", lastError);
        }

        private static JsonObject PublicJwk(ECParameters parameters)
        {
            if (parameters.Q.X == null || parameters.Q.Y == null)
            {
                throw new CryptographicException("ECDSA public key coordinates are unavailable.");
            }

            return new JsonObject
            {
                ["kty"] = "EC",
                ["crv"] = "P-256",
                ["x"] = Base64Url(parameters.Q.X),
                ["y"] = Base64Url(parameters.Q.Y)
            };
        }

        private static string KeyThumbprint(JsonObject jwk)
        {
            var canonical = $"{{\"crv\":\"P-256\",\"kty\":\"EC\",\"x\":\"{jwk["x"]?.GetValue<string>()}\",\"y\":\"{jwk["y"]?.GetValue<string>()}\"}}";
            return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
        }

        private static string Base64Url(byte[] bytes) =>
            Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');

        private static string CreateResponse(string requestId, bool success, JsonNode? result, string? errorCode = null, string? errorMessage = null)
        {
            var res = new JsonObject
            {
                ["requestId"] = requestId,
                ["success"] = success
            };
            if (result != null) res["result"] = result;
            if (errorCode != null) res["errorCode"] = errorCode;
            if (errorMessage != null) res["errorMessage"] = errorMessage;

            return res.ToJsonString();
        }
    }
}
