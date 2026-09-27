'use strict';

const mongoose = require('mongoose');

const ROLES = [
  'MASTER',
  'OWNER',
  'CAFE_ADMIN',
  'STAFF',
  'VENDOR',
];

const PERMISSION_EFFECTS = [
  'ALLOW',
  'DENY',
];

const PERMISSION_SCOPES = [
  'ORGANISATION',
  'ASSIGNED_CAFES',
  'CAFE',
  'SELF',
  'RECORD',
];

const rolePermissionSchema = new mongoose.Schema(
  {
    permissionRuleId: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
      uppercase: true,
      match: /^PR-\d{4,}$/,
    },

    organisationId: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    role: {
      type: String,
      required: true,
      enum: ROLES,
      index: true,
    },

    cafeId: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
      index: true,
    },

    permissionCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 150,
      match: /^[A-Z0-9_:.]+$/,
      index: true,
    },

    module: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 100,
      index: true,
    },

    resource: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 120,
    },

    action: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 80,
    },

    effect: {
      type: String,
      required: true,
      enum: PERMISSION_EFFECTS,
      default: 'DENY',
      index: true,
    },

    scope: {
      type: String,
      required: true,
      enum: PERMISSION_SCOPES,
      default: 'SELF',
      index: true,
    },

    fieldAccess: {
      allowedFields: {
        type: [String],
        default: [],
      },

      deniedFields: {
        type: [String],
        default: [],
      },

      maskedFields: {
        type: [String],
        default: [],
      },
    },

    conditions: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    requiresMfa: {
      type: Boolean,
      default: false,
    },

    requiresStepUpAuthentication: {
      type: Boolean,
      default: false,
    },

    requiresReason: {
      type: Boolean,
      default: false,
    },

    requiresAuditEvent: {
      type: Boolean,
      default: true,
    },

    requiresReauthentication: {
      type: Boolean,
      default: false,
    },

    isDelegable: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    effectiveFrom: {
      type: Date,
      required: true,
      default: Date.now,
      index: true,
    },

    effectiveTo: {
      type: Date,
      default: null,
      index: true,
    },

    description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },

    policyVersion: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },

    createdBy: {
      type: String,
      required: true,
      immutable: true,
      trim: true,
      uppercase: true,
    },

    updatedBy: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    archivedAt: {
      type: Date,
      default: null,
    },

    archivedBy: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },

    archiveReason: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
  },
  {
    timestamps: true,
    optimisticConcurrency: true,
    versionKey: 'version',
    collection: 'role_permissions',
  }
);

rolePermissionSchema.index(
  {
    organisationId: 1,
    role: 1,
    cafeId: 1,
    permissionCode: 1,
    isActive: 1,
  },
  {
    name: 'role_cafe_permission_status',
  }
);

rolePermissionSchema.index(
  {
    organisationId: 1,
    role: 1,
    module: 1,
    isActive: 1,
  },
  {
    name: 'role_module_active',
  }
);

rolePermissionSchema.index(
  {
    organisationId: 1,
    permissionCode: 1,
    effect: 1,
    isActive: 1,
  },
  {
    name: 'permission_effect_active',
  }
);

rolePermissionSchema.index(
  {
    organisationId: 1,
    role: 1,
    effectiveFrom: 1,
    effectiveTo: 1,
  },
  {
    name: 'role_effective_period',
  }
);

rolePermissionSchema.pre(
  'validate',
  function normalizePermissionFields() {
    if (this.permissionRuleId) {
      this.permissionRuleId =
        this.permissionRuleId.trim().toUpperCase();
    }

    if (this.organisationId) {
      this.organisationId =
        this.organisationId.trim().toUpperCase();
    }

    if (this.cafeId) {
      this.cafeId = this.cafeId.trim().toUpperCase();
    }

    if (this.permissionCode) {
      this.permissionCode =
        this.permissionCode.trim().toUpperCase();
    }

    if (this.module) {
      this.module = this.module.trim().toUpperCase();
    }

    if (this.resource) {
      this.resource =
        this.resource.trim().toUpperCase();
    }

    if (this.action) {
      this.action = this.action.trim().toUpperCase();
    }

    if (
      this.effectiveTo &&
      this.effectiveFrom &&
      this.effectiveTo <= this.effectiveFrom
    ) {
      this.invalidate(
        'effectiveTo',
        'The permission end date must be after its start date.'
      );
    }

    if (
      this.scope === 'CAFE' &&
      !this.cafeId
    ) {
      this.invalidate(
        'cafeId',
        'A café-scoped permission requires a café ID.'
      );
    }

    if (
      this.role === 'STAFF' &&
      this.scope === 'ORGANISATION'
    ) {
      this.invalidate(
        'scope',
        'Staff cannot receive organisation-wide access.'
      );
    }

    if (
      this.role === 'CAFE_ADMIN' &&
      this.scope === 'ORGANISATION'
    ) {
      this.invalidate(
        'scope',
        'Café Admin cannot receive organisation-wide access.'
      );
    }

    const normalizeFields = (fields) => [
      ...new Set(
        fields
          .filter(Boolean)
          .map((field) => field.trim())
      ),
    ];

    this.fieldAccess.allowedFields =
      normalizeFields(
        this.fieldAccess.allowedFields || []
      );

    this.fieldAccess.deniedFields =
      normalizeFields(
        this.fieldAccess.deniedFields || []
      );

    this.fieldAccess.maskedFields =
      normalizeFields(
        this.fieldAccess.maskedFields || []
      );
  }
);

rolePermissionSchema.methods.isCurrentlyEffective =
  function isCurrentlyEffective(at = new Date()) {
    if (!this.isActive || this.archivedAt) {
      return false;
    }

    if (this.effectiveFrom > at) {
      return false;
    }

    if (
      this.effectiveTo &&
      this.effectiveTo <= at
    ) {
      return false;
    }

    return true;
  };

rolePermissionSchema.methods.appliesToCafe =
  function appliesToCafe(cafeId) {
    if (
      this.scope === 'ORGANISATION' ||
      this.scope === 'SELF' ||
      this.scope === 'ASSIGNED_CAFES'
    ) {
      return true;
    }

    if (!cafeId || !this.cafeId) {
      return false;
    }

    return (
      this.cafeId ===
      cafeId.trim().toUpperCase()
    );
  };

rolePermissionSchema.methods.archive =
  function archive({
    userId,
    reason,
  }) {
    if (!userId || !reason) {
      throw new Error(
        'Archiving a permission requires a user ID and reason.'
      );
    }

    this.isActive = false;
    this.archivedAt = new Date();
    this.archivedBy =
      userId.trim().toUpperCase();
    this.archiveReason = reason.trim();

    return this.save();
  };

rolePermissionSchema.statics.findEffectiveRules =
  function findEffectiveRules({
    organisationId,
    role,
    cafeId = null,
    permissionCode = null,
    at = new Date(),
  }) {
    const query = {
      organisationId:
        organisationId.trim().toUpperCase(),
      role,
      isActive: true,
      archivedAt: null,
      effectiveFrom: {
        $lte: at,
      },
      $or: [
        {
          effectiveTo: null,
        },
        {
          effectiveTo: {
            $gt: at,
          },
        },
      ],
    };

    if (permissionCode) {
      query.permissionCode =
        permissionCode.trim().toUpperCase();
    }

    if (cafeId) {
      const normalizedCafeId =
        cafeId.trim().toUpperCase();

      query.$and = [
        {
          $or: [
            {
              cafeId: null,
            },
            {
              cafeId: normalizedCafeId,
            },
          ],
        },
      ];
    }

    return this.find(query).sort({
      effect: 1,
      createdAt: 1,
    });
  };

const RolePermission =
  mongoose.models.RolePermission ||
  mongoose.model(
    'RolePermission',
    rolePermissionSchema
  );

module.exports = {
  RolePermission,
  ROLES,
  PERMISSION_EFFECTS,
  PERMISSION_SCOPES,
};