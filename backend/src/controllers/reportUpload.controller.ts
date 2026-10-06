import { Response } from "express";

import prisma from "../config/db";

import cloudinary from "../config/cloudinary";

import streamifier from "streamifier";

import {
  AuthRequest,
} from "../middleware/auth.middleware";

export const uploadReport =
  async (
    req: AuthRequest & {
      file?: Express.Multer.File;
    },
    res: Response
  ) => {

    try {

      const file =
        req.file;

      if (!file) {

        return res.status(400).json({
          success: false,
          message:
            "No file uploaded",
        });
      }

      if (!req.user?.id) {

        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      /* =========================================
         CLOUDINARY UPLOAD
      ========================================= */

      const uploaded =
        await new Promise<any>(
          (
            resolve,
            reject
          ) => {

            const stream =
              cloudinary.uploader.upload_stream(
                {
                  folder:
                    "reports",

                  resource_type:
                    "raw",
                },

                (
                  error,
                  result
                ) => {

                  if (error) {

                    reject(error);

                  } else {

                    resolve(result);
                  }
                }
              );

            streamifier
              .createReadStream(
                file.buffer
              )
              .pipe(stream);
          }
        );

      /* =========================================
         SAVE REPORT IN DATABASE
      ========================================= */

      const report =
  await prisma.report.create({
    data: {

      reportName:
        file.originalname,

      reportUrl:
        uploaded.secure_url,

      reportType:
        file.mimetype,

      generatedBy:
        null,
    },
  });

      return res.status(201).json({
        success: true,

        message:
          "Report uploaded successfully",

        report,
      });

    } catch (error) {

      console.log(error);

      return res.status(500).json({
        success: false,

        message:
          "Failed to upload report",
      });
    }
  };

/* =========================================
   DELETE REPORT
   1. Find the report in DB to get the
      Cloudinary public_id from the URL
   2. Delete from Cloudinary
   3. Delete from database
========================================= */

export const deleteReport =
  async (
    req: AuthRequest,
    res: Response
  ) => {

    try {

      const id =
        req.params.id as string;

      if (!req.user?.id) {

        return res.status(401).json({
          success: false,
          message:
            "Unauthorized",
        });
      }

      /* FIND REPORT IN DB */

      const report =
        await prisma.report.findUnique({
          where: { id },
        });

      if (!report) {

        return res.status(404).json({
          success: false,
          message:
            "Report not found",
        });
      }

      /* =========================================
         EXTRACT CLOUDINARY PUBLIC ID FROM URL
         Cloudinary secure_url format:
         https://res.cloudinary.com/{cloud}/
           {type}/upload/{version}/{folder}/{file}
         public_id = folder/file (no extension)
      ========================================= */

      const urlParts =
        report.reportUrl.split("/upload/");

      const afterUpload =
        urlParts[1];

      /* Strip version segment (v1234567890/) */
      const withoutVersion =
        afterUpload.replace(
          /^v\d+\//,
          ""
        );

      /* Strip file extension */
      const publicId =
        withoutVersion.replace(
          /\.[^/.]+$/,
          ""
        );

      /* =========================================
         DELETE FROM CLOUDINARY
         resource_type must match how the file
         was uploaded (auto → could be image/raw).
         Try both to be safe.
      ========================================= */

      try {

        await cloudinary.uploader.destroy(
          publicId,
          { resource_type: "image" }
        );

      } catch {

        await cloudinary.uploader.destroy(
          publicId,
          { resource_type: "raw" }
        );
      }

      /* DELETE FROM DATABASE */

      await prisma.report.delete({
        where: { id },
      });

      return res.status(200).json({
        success: true,
        message:
          "Report deleted successfully",
      });

    } catch (error) {

      console.log(error);

      return res.status(500).json({
        success: false,
        message:
          "Failed to delete report",
      });
    }
  };