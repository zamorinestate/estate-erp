using System;
using System.IO;
using System.Text.Json.Nodes;
using System.Threading.Tasks;
using Xunit;
using Zamorin.Cafe.ERP;

namespace ZamorinCafeERP.Tests
{
    public class ZamorinWindowsClientTests
    {
        [Fact]
        public void SecurityConfig_ProductionOriginsAllowed()
        {
            Assert.True(ZamorinSecurityConfig.IsAllowedOrigin("https://zamorin-cafe-erp.vercel.app"));
            Assert.True(ZamorinSecurityConfig.IsAllowedOrigin("https://zamorin.app"));
            Assert.True(ZamorinSecurityConfig.IsAllowedOrigin("https://zamorin-cafe-erp-backend.onrender.com"));
        }

        [Fact]
        public void SecurityConfig_DisallowedOriginsRejected()
        {
            Assert.False(ZamorinSecurityConfig.IsAllowedOrigin("http://zamorin-cafe-erp.vercel.app")); // cleartext http
            Assert.False(ZamorinSecurityConfig.IsAllowedOrigin("https://malicious.com"));
            Assert.False(ZamorinSecurityConfig.IsAllowedOrigin("javascript:alert(1)"));
            Assert.False(ZamorinSecurityConfig.IsAllowedOrigin("file:///C:/Windows/System32"));
            Assert.False(ZamorinSecurityConfig.IsAllowedOrigin(null));
        }

        [Fact]
        public void SecurityConfig_ParseValidCafeLoginReference()
        {
            var ref1 = ZamorinSecurityConfig.ParseCafeLoginReference("https://zamorin-cafe-erp.vercel.app/cafe/CB5A84F8/login");
            Assert.Equal("CB5A84F8", ref1);

            var ref2 = ZamorinSecurityConfig.ParseCafeLoginReference("https://zamorin.app/cafe/CAFE_KZD_01/login");
            Assert.Equal("CAFE_KZD_01", ref2);
        }

        [Fact]
        public void SecurityConfig_InvalidCafeReferenceRejected()
        {
            Assert.Null(ZamorinSecurityConfig.ParseCafeLoginReference("https://untrusted.com/cafe/CB5A84F8/login"));
            Assert.Null(ZamorinSecurityConfig.ParseCafeLoginReference("https://zamorin-cafe-erp.vercel.app/cafe/../../etc/passwd/login"));
            Assert.Null(ZamorinSecurityConfig.ParseCafeLoginReference("https://zamorin-cafe-erp.vercel.app/cafe/CB5A84F8"));
        }

        [Fact]
        public void StorageManager_PathTraversalDetected()
        {
            Assert.True(ZamorinStorageManager.IsPathTraversal("../Exports"));
            Assert.True(ZamorinStorageManager.IsPathTraversal("/Windows/System32"));
            Assert.True(ZamorinStorageManager.IsPathTraversal("~/secret"));
            Assert.False(ZamorinStorageManager.IsPathTraversal("ZAMORIN ERP/Exports"));
            Assert.False(ZamorinStorageManager.IsPathTraversal("POS/Invoices"));
        }

        [Fact]
        public async Task StorageManager_WriteDocumentSuccess()
        {
            var tempDir = Path.Combine(Path.GetTempPath(), "ZamorinTest_" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDir);

            try
            {
                var data = new byte[] { 1, 2, 3, 4, 5 };
                var res = await ZamorinStorageManager.WriteDocumentAsync(tempDir, "ZAMORIN ERP/Exports", "test_report.pdf", data);
                Assert.True(res.Success);
                Assert.NotNull(res.FilePath);
                Assert.True(File.Exists(res.FilePath));
                Assert.Equal(5, res.BytesWritten);
            }
            finally
            {
                if (Directory.Exists(tempDir)) Directory.Delete(tempDir, true);
            }
        }

        [Fact]
        public async Task NativeBridge_CommonMessageProtocol()
        {
            var mockCallbacks = new TestCallbacks();
            var bridge = new ZamorinNativeBridge(mockCallbacks);

            // 1. Unknown action
            var unknownReq = new JsonObject
            {
                ["requestId"] = "req_1",
                ["action"] = "EXECUTE_ARBITRARY_COMMAND"
            }.ToJsonString();

            var unknownRes = await bridge.HandleMessageAsync(unknownReq);
            var unknownNode = JsonNode.Parse(unknownRes);
            Assert.False(unknownNode?["success"]?.GetValue<bool>());
            Assert.Equal("UNKNOWN_NATIVE_ACTION", unknownNode?["errorCode"]?.GetValue<string>());

            // 2. Capabilities
            var capsReq = new JsonObject
            {
                ["requestId"] = "req_2",
                ["action"] = "GET_DEVICE_CAPABILITIES"
            }.ToJsonString();

            var capsRes = await bridge.HandleMessageAsync(capsReq);
            var capsNode = JsonNode.Parse(capsRes);
            Assert.True(capsNode?["success"]?.GetValue<bool>());
            Assert.Equal("WINDOWS", capsNode?["result"]?["platform"]?.GetValue<string>());
        }

        private class TestCallbacks : ZamorinNativeBridge.IBridgeCallbacks
        {
            public Task<string?> OnRequestDirectoryPickerAsync(string requestId) => Task.FromResult<string?>("C:\\ZamorinExports");
            public Task<string?> OnOpenFilePickerAsync(string requestId, string? filter) => Task.FromResult<string?>("C:\\file.pdf");
            public Task<bool> OnOpenSystemPrintAsync(string requestId, string jobName) => Task.FromResult(true);
            public Task<bool> OnShareDocumentAsync(string requestId, string filename, byte[] data) => Task.FromResult(true);
        }
    }
}
