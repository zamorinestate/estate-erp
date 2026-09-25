'use strict';

const {
  Notification,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_STATUSES,
} = require('../models/Notification');

const {
  asyncHandler,
} = require('../utils/asyncHandler');

const {
  ApiError,
} = require('../utils/ApiError');

function normalizeIdentifier(value) {
  return typeof value === 'string'
    ? value.trim().toUpperCase()
    : '';
}

function parsePositiveInteger(
  value,
  fallback,
  maximum
) {
  const parsedValue =
    Number.parseInt(value, 10);

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < 1
  ) {
    return fallback;
  }

  return Math.min(
    parsedValue,
    maximum
  );
}

function buildNotificationFilter(request) {
  const filter = {
    organisationId: request.auth.organisationId,
  };

  if (request.auth.role === 'MASTER') {
    filter.$or = [
      { recipientUserId: request.auth.userId },
      { recipientUserId: 'MU-0001' },
      { recipientRole: 'MASTER' },
    ];
  } else {
    filter.recipientUserId = request.auth.userId;
  }

  const filterTab = String(request.query.filterTab || request.query.tab || '').trim().toUpperCase();

  if (filterTab === 'ARCHIVED') {
    filter.archivedAt = { $ne: null };
  } else {
    filter.archivedAt = null;
  }

  if (filterTab === 'UNREAD') {
    filter.readAt = null;
  } else if (filterTab === 'IMPORTANT') {
    filter.priority = { $in: ['HIGH', 'CRITICAL'] };
  } else if (filterTab === 'ACTION_REQUIRED') {
    filter.acknowledgementRequired = true;
    filter.acknowledgedAt = null;
  } else if (filterTab === 'ACKNOWLEDGED') {
    filter.acknowledgedAt = { $ne: null };
  }

  const priority = normalizeIdentifier(request.query.priority);
  if (priority) {
    if (!NOTIFICATION_PRIORITIES.includes(priority)) {
      throw new ApiError(400, 'INVALID_NOTIFICATION_PRIORITY', 'The requested notification priority is invalid.');
    }
    filter.priority = priority;
  }

  const status = normalizeIdentifier(request.query.status);
  if (status) {
    if (!NOTIFICATION_STATUSES.includes(status)) {
      throw new ApiError(400, 'INVALID_NOTIFICATION_STATUS', 'The requested notification status is invalid.');
    }
    filter.status = status;
  }

  const category = normalizeIdentifier(request.query.category);
  if (category) {
    filter.category = category;
  }

  const cafeId = normalizeIdentifier(request.query.cafeId);
  if (cafeId) {
    if (request.auth.role !== 'MASTER' && (!request.auth.assignedCafeIds || !request.auth.assignedCafeIds.includes(cafeId))) {
      const errCode = request.auth.role === 'OWNER' ? 'CROSS_CAFE_RESOURCE_DENIED' : 'CAFE_ACCESS_DENIED';
      throw new ApiError(403, errCode, 'You do not have access to this café.');
    }
    filter.cafeId = cafeId;
  }

  if (request.query.unreadOnly === 'true') {
    filter.readAt = null;
  }

  const search = String(request.query.search || request.query.q || '').trim();
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { title: { $regex: escaped, $options: 'i' } },
      { message: { $regex: escaped, $options: 'i' } },
      { category: { $regex: escaped, $options: 'i' } },
    ];
  }

  return filter;
}

async function findUserNotification(
  request
) {
  const notificationId =
    normalizeIdentifier(
      request.params.notificationId
    );

  if (!notificationId) {
    throw new ApiError(
      400,
      'NOTIFICATION_ID_REQUIRED',
      'A notification ID is required.'
    );
  }

  const notification =
    await Notification.findOne({
      organisationId:
        request.auth.organisationId,

      recipientUserId:
        request.auth.userId,

      notificationId,
    });

  if (!notification) {
    throw new ApiError(
      404,
      'NOTIFICATION_NOT_FOUND',
      'The notification was not found.'
    );
  }

  if (notification.cafeId && request.auth.role !== 'MASTER') {
    const isAssigned = (request.auth.assignedCafeIds && request.auth.assignedCafeIds.includes(notification.cafeId)) || request.auth.primaryCafeId === notification.cafeId;
    if (!isAssigned) {
      throw new ApiError(403, 'CROSS_CAFE_NOTIFICATION_DENIED', 'Cannot access notification belonging to another café.');
    }
  }

  return notification;
}

const listNotifications = asyncHandler(
  async (request, response) => {
    const page =
      parsePositiveInteger(
        request.query.page,
        1,
        100000
      );

    const limit =
      parsePositiveInteger(
        request.query.limit,
        25,
        100
      );

    const filter =
      buildNotificationFilter(request);

    const skip =
      (page - 1) * limit;

    const [
      notifications,
      total,
      unreadCount,
      actionRequiredCount,
    ] = await Promise.all([
      Notification.find(filter)
        .sort({
          priority: -1,
          createdAt: -1,
        })
        .skip(skip)
        .limit(limit),

      Notification.countDocuments(filter),

      Notification.countDocuments({
        organisationId: request.auth.organisationId,
        recipientUserId: request.auth.userId,
        readAt: null,
        archivedAt: null,
      }),

      Notification.countDocuments({
        organisationId: request.auth.organisationId,
        recipientUserId: request.auth.userId,
        acknowledgementRequired: true,
        acknowledgedAt: null,
        archivedAt: null,
      }),
    ]);

    return response.status(200).json({
      success: true,

      data: {
        notifications,
        unreadCount,
        actionRequiredCount,

        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },

      correlationId: request.correlationId || null,
    });
  }
);

const getNotification = asyncHandler(
  async (request, response) => {
    const notification =
      await findUserNotification(
        request
      );

    if (!notification.firstViewedAt) {
      await notification.markViewed();
    }

    return response.status(200).json({
      success: true,

      data: {
        notification,
      },

      correlationId:
        request.correlationId || null,
    });
  }
);

const markNotificationRead = asyncHandler(
  async (request, response) => {
    const notification =
      await findUserNotification(
        request
      );

    await notification.markRead();

    return response.status(200).json({
      success: true,

      message:
        'Notification marked as read.',

      data: {
        notification,
      },

      correlationId:
        request.correlationId || null,
    });
  }
);

const markNotificationUnread = asyncHandler(
  async (request, response) => {
    const notification = await findUserNotification(request);
    await notification.markUnread();

    return response.status(200).json({
      success: true,
      message: 'Notification marked as unread.',
      data: { notification },
      correlationId: request.correlationId || null,
    });
  }
);

const markAllNotificationsRead =
  asyncHandler(
    async (request, response) => {
      const now = new Date();

      const result =
        await Notification.updateMany(
          {
            organisationId:
              request.auth.organisationId,

            recipientUserId:
              request.auth.userId,

            readAt: null,

            archivedAt: null,
          },
          {
            $set: {
              firstViewedAt: now,
              readAt: now,
            },
          }
        );

      return response.status(200).json({
        success: true,

        message:
          'All notifications were marked as read.',

        data: {
          modifiedCount:
            result.modifiedCount,
        },

        correlationId:
          request.correlationId || null,
      });
    }
  );

const acknowledgeNotification =
  asyncHandler(
    async (request, response) => {
      const notification =
        await findUserNotification(
          request
        );

      if (
        !notification
          .acknowledgementRequired
      ) {
        throw new ApiError(
          400,
          'ACKNOWLEDGEMENT_NOT_REQUIRED',
          'This notification does not require acknowledgement.'
        );
      }

      await notification.acknowledge();

      return response.status(200).json({
        success: true,

        message:
          'Notification acknowledged successfully.',

        data: {
          notification,
        },

        correlationId:
          request.correlationId || null,
      });
    }
  );

const archiveNotification =
  asyncHandler(
    async (request, response) => {
      const notification =
        await findUserNotification(
          request
        );

      if (!notification.archivedAt) {
        notification.archivedAt =
          new Date();

        await notification.save();
      }

      return response.status(200).json({
        success: true,

        message:
          'Notification archived successfully.',

        data: {
          notificationId:
            notification.notificationId,
        },

        correlationId:
          request.correlationId || null,
      });
    }
  );

module.exports = {
  listNotifications,
  getNotification,
  markNotificationRead,
  markNotificationUnread,
  markAllNotificationsRead,
  acknowledgeNotification,
  archiveNotification,
};