'use strict';

const mongoose = require('mongoose');

const DEVICE_TYPES = ['POS_COUNTER', 'KDS', 'MOBILE_WAITER', 'KITCHEN_STATION'];
const CONNECTION_TYPES = ['NETWORK', 'BLUETOOTH', 'USB', 'WEBSOCKET_PROXY', 'VIRTUAL_PREVIEW'];
const PAPER_WIDTHS = [58, 80];
const STATION_TYPES = ['ALL', 'BARISTA', 'HOT_KITCHEN', 'DESSERT_BAR', 'DISPATCH'];

const hardwareAuditEntrySchema = new mongoose.Schema(
  {
    event: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    actorUserId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    transactionId: {
      type: String,
      trim: true,
      default: null,
    },
    reason: {
      type: String,
      trim: true,
      default: null,
    },
    details: {
      type: String,
      trim: true,
      default: null,
    },
  },
  { _id: false }
);

const hardwareTerminalSchema = new mongoose.Schema(
  {
    terminalId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    organisationId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    cafeId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      index: true,
    },
    terminalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    deviceType: {
      type: String,
      enum: DEVICE_TYPES,
      default: 'POS_COUNTER',
      index: true,
    },
    printerConfig: {
      enabled: {
        type: Boolean,
        default: true,
      },
      connectionType: {
        type: String,
        enum: CONNECTION_TYPES,
        default: 'NETWORK',
      },
      ipAddress: {
        type: String,
        trim: true,
        default: null,
      },
      port: {
        type: Number,
        default: 9100,
      },
      macAddress: {
        type: String,
        trim: true,
        default: null,
      },
      usbVendorId: {
        type: String,
        trim: true,
        default: null,
      },
      usbProductId: {
        type: String,
        trim: true,
        default: null,
      },
      paperWidth: {
        type: Number,
        enum: PAPER_WIDTHS,
        default: 80,
      },
      characterSet: {
        type: String,
        trim: true,
        default: 'PC437_USA',
      },
      cutType: {
        type: String,
        enum: ['FULL', 'PARTIAL', 'FEED_AND_CUT'],
        default: 'PARTIAL',
      },
      dpi: {
        type: Number,
        default: 203,
      },
    },
    drawerConfig: {
      enabled: {
        type: Boolean,
        default: true,
      },
      kickPulseCommand: {
        type: String,
        default: 'ESC_p_0_25_250',
      },
      pin: {
        type: Number,
        enum: [2, 5],
        default: 2,
      },
    },
    scannerConfig: {
      enabled: {
        type: Boolean,
        default: true,
      },
      interfaceType: {
        type: String,
        enum: ['HID_KEYBOARD', 'SERIAL_COM', 'CAMERA_SCANNER'],
        default: 'HID_KEYBOARD',
      },
      baudRate: {
        type: Number,
        default: 9600,
      },
      comPort: {
        type: String,
        trim: true,
        default: null,
      },
    },
    scaleConfig: {
      enabled: {
        type: Boolean,
        default: false,
      },
      protocol: {
        type: String,
        enum: ['TOLEDO', 'CAS', 'GENERIC_CONTINUOUS', 'NONE'],
        default: 'NONE',
      },
      baudRate: {
        type: Number,
        default: 9600,
      },
      comPort: {
        type: String,
        trim: true,
        default: null,
      },
    },
    stationRouting: {
      stationType: {
        type: String,
        enum: STATION_TYPES,
        default: 'ALL',
      },
      itemCategories: {
        type: [String],
        default: [],
      },
    },
    status: {
      online: {
        type: Boolean,
        default: false,
      },
      lastHeartbeat: {
        type: Date,
        default: null,
      },
      evidenceSource: {
        type: String,
        enum: ['NONE', 'DEVICE_ATTESTED', 'TRUSTED_PROXY'],
        default: 'NONE',
      },
      hardwareVerifiedAt: {
        type: Date,
        default: null,
      },
      paperStatus: {
        type: String,
        enum: ['NORMAL', 'NEAR_END', 'EMPTY', 'UNKNOWN'],
        default: 'UNKNOWN',
      },
      coverStatus: {
        type: String,
        enum: ['CLOSED', 'OPEN', 'UNKNOWN'],
        default: 'UNKNOWN',
      },
      drawerStatus: {
        type: String,
        enum: ['CLOSED', 'OPEN', 'UNKNOWN'],
        default: 'UNKNOWN',
      },
    },
    auditEvents: {
      type: [hardwareAuditEntrySchema],
      default: [],
    },
    createdBy: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    updatedBy: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'hardware_terminals',
  }
);

hardwareTerminalSchema.index({ organisationId: 1, cafeId: 1, terminalId: 1 }, { unique: true });
hardwareTerminalSchema.index({ organisationId: 1, cafeId: 1, deviceType: 1 });

const HardwareTerminal =
  mongoose.models.HardwareTerminal || mongoose.model('HardwareTerminal', hardwareTerminalSchema);

module.exports = {
  HardwareTerminal,
  DEVICE_TYPES,
  CONNECTION_TYPES,
  PAPER_WIDTHS,
  STATION_TYPES,
};
