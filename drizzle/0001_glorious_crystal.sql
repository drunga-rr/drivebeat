CREATE TABLE `googleDriveConnections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`encryptedAccessToken` text NOT NULL,
	`encryptedRefreshToken` text,
	`tokenExpiresAt` timestamp,
	`scope` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `googleDriveConnections_id` PRIMARY KEY(`id`),
	CONSTRAINT `googleDriveConnections_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `googleDriveFiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`driveFileId` varchar(128) NOT NULL,
	`parentDriveFolderId` varchar(128),
	`name` varchar(512) NOT NULL,
	`mimeType` varchar(128) NOT NULL,
	`sizeBytes` int,
	`modifiedTime` timestamp,
	`album` varchar(512),
	`artist` varchar(512),
	`coverDriveFileId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `googleDriveFiles_id` PRIMARY KEY(`id`)
);
