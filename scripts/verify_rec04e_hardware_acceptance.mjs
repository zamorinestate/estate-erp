import { readFile } from 'fs/promises';
import path from 'path';

const reportArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
if (!reportArg) {
  console.error('Usage: npm run verify:rec04e:hardware -- <acceptance-report.json>');
  process.exit(2);
}

const reportPath = path.resolve(reportArg);
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const failures = [];

if (report.schemaVersion !== 'REC04E_HARDWARE_ACCEPTANCE_V1') failures.push('schemaVersion');
if (!/^REC04E-/.test(String(report.acceptanceId || ''))) failures.push('acceptanceId');
if (!/^PJ-REC04E-/.test(String(report.printJobId || ''))) failures.push('printJobId');
if (!/^[a-f0-9]{64}$/.test(String(report.payload?.sha256 || ''))) failures.push('payload.sha256');
if (!Number.isSafeInteger(Number(report.payload?.bytes)) || Number(report.payload.bytes) <= 0) failures.push('payload.bytes');
if (report.printer?.endpointPinned !== true) failures.push('printer.endpointPinned');
if (!report.printer?.endpointFingerprint || !/^[a-f0-9]{64}$/.test(report.printer.endpointFingerprint)) failures.push('printer.endpointFingerprint');
if (!report.printer?.model) failures.push('printer.model');
if (!report.printer?.serial) failures.push('printer.serial');
if (report.transport?.contentTransportVerified !== true) failures.push('transport.contentTransportVerified');
if (report.physicalObservation?.paperOutputConfirmed !== true) failures.push('physicalObservation.paperOutputConfirmed');
if (report.physicalObservation?.cutterConfirmed !== true) failures.push('physicalObservation.cutterConfirmed');
if (
  report.payload?.drawerKickRequested === true &&
  report.physicalObservation?.drawerOpenedConfirmed !== true
) failures.push('physicalObservation.drawerOpenedConfirmed');
if (report.runtimeEvidenceBoundary?.printerIdentityCryptographicallyVerified !== false) failures.push('runtimeEvidenceBoundary.printerIdentityCryptographicallyVerified');
if (report.runtimeEvidenceBoundary?.physicalPrintCryptographicallyVerified !== false) failures.push('runtimeEvidenceBoundary.physicalPrintCryptographicallyVerified');
if (report.certified !== true) failures.push('certified');

if (failures.length) {
  console.error(JSON.stringify({ valid: false, failures, reportPath }, null, 2));
  process.exit(1);
}

console.log(JSON.stringify({
  valid: true,
  certified: true,
  acceptanceId: report.acceptanceId,
  reportPath,
}, null, 2));
