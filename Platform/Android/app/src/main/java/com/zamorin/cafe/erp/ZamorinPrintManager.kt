package com.zamorin.cafe.erp

import android.content.Context
import android.os.CancellationSignal
import android.os.ParcelFileDescriptor
import android.print.PageRange
import android.print.PrintAttributes
import android.print.PrintDocumentAdapter
import android.print.PrintDocumentInfo
import android.print.PrintManager
import android.webkit.WebView
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException

/**
 * ZAMORIN CAFÉ ERP — ANDROID PRINT FRAMEWORK ADAPTER
 *
 * Implements Android System Print Framework integration for A4 official documents,
 * tax invoices, compliance reports, and POS receipts via standard print spooler.
 *
 * Device Status:
 * Direct Bluetooth/USB ESC/POS thermal printing is preserved via the existing network/browser
 * bridge; direct native serial/ESC-POS socket driver is explicitly marked as a later phase device item.
 *
 * Architectural Invariant:
 * Native print jobs are purely post-transaction output renderers.
 * A print failure or cancellation MUST NEVER recreate, alter, or duplicate financial or inventory postings.
 */
object ZamorinPrintManager {

    data class PrintResult(
        val success: Boolean,
        val jobName: String,
        val error: String? = null
    )

    /**
     * Prints the current active WebView document content using Android Print Framework.
     */
    fun printWebView(context: Context, webView: WebView, jobName: String = "Zamorin_Document"): PrintResult {
        return try {
            val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager
                ?: return PrintResult(false, jobName, "PRINT_SERVICE_UNAVAILABLE")

            val safeJobName = jobName.trim().replace(Regex("[/\\\\:*?\"<>|]"), "_")
            val printAdapter = webView.createPrintDocumentAdapter(safeJobName)

            val printAttributes = PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                .build()

            val printJob = printManager.print(safeJobName, printAdapter, printAttributes)
            PrintResult(
                success = true,
                jobName = safeJobName
            )
        } catch (e: Exception) {
            PrintResult(false, jobName, e.message ?: "PRINT_EXCEPTION")
        }
    }

    /**
     * Prints a local PDF file from the device cache using a custom PrintDocumentAdapter.
     */
    fun printPdfFile(context: Context, pdfFile: File, jobName: String = "Zamorin_Report"): PrintResult {
        if (!pdfFile.exists() || pdfFile.length() == 0L) {
            return PrintResult(false, jobName, "FILE_NOT_FOUND_OR_EMPTY")
        }

        return try {
            val printManager = context.getSystemService(Context.PRINT_SERVICE) as? PrintManager
                ?: return PrintResult(false, jobName, "PRINT_SERVICE_UNAVAILABLE")

            val safeJobName = jobName.trim().replace(Regex("[/\\\\:*?\"<>|]"), "_")

            val adapter = object : PrintDocumentAdapter() {
                override fun onLayout(
                    oldAttributes: PrintAttributes?,
                    newAttributes: PrintAttributes?,
                    cancellationSignal: CancellationSignal?,
                    callback: LayoutResultCallback?,
                    extras: android.os.Bundle?
                ) {
                    if (cancellationSignal?.isCanceled == true) {
                        callback?.onLayoutCancelled()
                        return
                    }
                    val info = PrintDocumentInfo.Builder(safeJobName)
                        .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                        .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
                        .build()
                    callback?.onLayoutFinished(info, newAttributes != oldAttributes)
                }

                override fun onWrite(
                    pages: Array<out PageRange>?,
                    destination: ParcelFileDescriptor?,
                    cancellationSignal: CancellationSignal?,
                    callback: WriteResultCallback?
                ) {
                    if (destination == null) {
                        callback?.onWriteFailed("DESTINATION_DESCRIPTOR_NULL")
                        return
                    }

                    var input: FileInputStream? = null
                    var output: FileOutputStream? = null

                    try {
                        input = FileInputStream(pdfFile)
                        output = FileOutputStream(destination.fileDescriptor)

                        val buffer = ByteArray(8192)
                        var bytesRead: Int
                        while (input.read(buffer).also { bytesRead = it } >= 0) {
                            if (cancellationSignal?.isCanceled == true) {
                                callback?.onWriteCancelled()
                                return
                            }
                            output.write(buffer, 0, bytesRead)
                        }
                        callback?.onWriteFinished(arrayOf(PageRange.ALL_PAGES))
                    } catch (e: Exception) {
                        callback?.onWriteFailed(e.message)
                    } finally {
                        try { input?.close() } catch (_: IOException) {}
                        try { output?.close() } catch (_: IOException) {}
                    }
                }
            }

            val printAttributes = PrintAttributes.Builder()
                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                .build()

            val printJob = printManager.print(safeJobName, adapter, printAttributes)
            PrintResult(
                success = true,
                jobName = safeJobName
            )
        } catch (e: Exception) {
            PrintResult(false, jobName, e.message ?: "PRINT_EXCEPTION")
        }
    }
}
