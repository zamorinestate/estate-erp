using System;
using System.Diagnostics;
using System.IO;
using System.Threading.Tasks;
using System.Windows;
using Microsoft.Web.WebView2.Core;
using Microsoft.Win32;

namespace Zamorin.Cafe.ERP
{
    public partial class MainWindow : Window, ZamorinNativeBridge.IBridgeCallbacks
    {
        private ZamorinNativeBridge? _bridge;

        public MainWindow()
        {
            InitializeComponent();
            _bridge = new ZamorinNativeBridge(this);
            Loaded += MainWindow_Loaded;
        }

        private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
        {
            await InitializeWebViewAsync();
        }

        private async Task InitializeWebViewAsync()
        {
            try
            {
                // Verify Evergreen Edge WebView2 Runtime availability before initialization
                string version = CoreWebView2Environment.GetAvailableBrowserVersionString();
                if (string.IsNullOrWhiteSpace(version))
                {
                    PromptWebView2Installation();
                    return;
                }

                await WebViewControl.EnsureCoreWebView2Async();

                var settings = WebViewControl.CoreWebView2.Settings;
                settings.IsScriptEnabled = true;
                settings.IsWebMessageEnabled = true;
                settings.AreDefaultContextMenusEnabled = false;

                WebViewControl.CoreWebView2.NavigationStarting += CoreWebView2_NavigationStarting;
                WebViewControl.CoreWebView2.WebMessageReceived += CoreWebView2_WebMessageReceived;

                WebViewControl.Source = new Uri(ZamorinSecurityConfig.ProductionBaseUrl);
            }
            catch (WebView2RuntimeNotFoundException)
            {
                PromptWebView2Installation();
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Failed to initialize WebView2: {ex.Message}\n\nPlease ensure the Microsoft Edge WebView2 Evergreen Runtime is installed.",
                    "Zamorin Café ERP - Startup",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }
        }

        private void PromptWebView2Installation()
        {
            var result = MessageBox.Show(
                "Microsoft Edge WebView2 Runtime is required to run Zamorin Café ERP.\n\nWould you like to open the official Microsoft download page now?",
                "WebView2 Runtime Required",
                MessageBoxButton.YesNo,
                MessageBoxImage.Warning);

            if (result == MessageBoxResult.Yes)
            {
                try
                {
                    Process.Start(new ProcessStartInfo("https://go.microsoft.com/fwlink/p/?LinkId=2124703") { UseShellExecute = true });
                }
                catch (Exception) {}
            }
        }

        private void CoreWebView2_NavigationStarting(object? sender, CoreWebView2NavigationStartingEventArgs e)
        {
            if (!ZamorinSecurityConfig.IsAllowedOrigin(e.Uri))
            {
                e.Cancel = true;
                try
                {
                    Process.Start(new ProcessStartInfo(e.Uri) { UseShellExecute = true });
                }
                catch (Exception) {}
            }
        }

        private async void CoreWebView2_WebMessageReceived(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            if (_bridge == null) return;
            var response = await _bridge.HandleMessageAsync(e.WebMessageAsJson);
            WebViewControl.CoreWebView2.PostWebMessageAsJson(response);
        }

        public Task<string?> OnRequestDirectoryPickerAsync(string requestId)
        {
            var dialog = new OpenFolderDialog
            {
                Title = "Select Zamorin ERP Export Directory"
            };

            if (dialog.ShowDialog(this) == true)
            {
                return Task.FromResult<string?>(dialog.FolderName);
            }

            return Task.FromResult<string?>(null);
        }

        public Task<string?> OnOpenFilePickerAsync(string requestId, string? filter)
        {
            var dialog = new OpenFileDialog
            {
                Title = "Select Attachment",
                Filter = string.IsNullOrEmpty(filter) ? "All Files (*.*)|*.*" : $"{filter}|*.*"
            };

            if (dialog.ShowDialog(this) == true)
            {
                return Task.FromResult<string?>(dialog.FileName);
            }

            return Task.FromResult<string?>(null);
        }

        public async Task<bool> OnOpenSystemPrintAsync(string requestId, string jobName)
        {
            try
            {
                WebViewControl.CoreWebView2.ShowPrintUI(CoreWebView2PrintDialogKind.Browser);
                return await Task.FromResult(true);
            }
            catch
            {
                return false;
            }
        }

        public async Task<bool> OnShareDocumentAsync(string requestId, string filename, byte[] data)
        {
            try
            {
                var tempDir = Path.Combine(Path.GetTempPath(), "ZamorinShares");
                if (!Directory.Exists(tempDir)) Directory.CreateDirectory(tempDir);
                var tempFile = Path.Combine(tempDir, filename);
                await File.WriteAllBytesAsync(tempFile, data);

                Process.Start(new ProcessStartInfo("explorer.exe", $"/select,\"{tempFile}\"") { UseShellExecute = true });
                return true;
            }
            catch
            {
                return false;
            }
        }
    }
}
