# ---------------------------------------------------------------------------
# Marketing-site media CDN  (MissFit AWS account 835016106003, us-east-1)
#
# Testimonial videos are too large to ship from this repo: Cloudflare Pages
# caps files at 25 MiB and the full interview cuts are ~53-57 MiB even after
# re-encoding. They are served from S3 + CloudFront instead, matching the
# pattern already used for missfitmindset.ai and archroute.com.
#
# STATUS: these resources were created via the AWS CLI on 2026-08-25 to
# unblock MM #8. They are NOT yet in any Terraform state. Import before the
# next apply, or Terraform will try to create duplicates:
#
#   terraform import aws_s3_bucket.marketing_media              missfit-s3-media-prd
#   terraform import aws_cloudfront_origin_access_control.media E2CR3MUIKKSNTO
#   terraform import aws_cloudfront_distribution.media          E213W02J15QH0G
#
# Live endpoint: https://d1cad8v1iaips2.cloudfront.net/video/<file>.mp4
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "marketing_media" {
  bucket = "missfit-s3-media-prd"
}

resource "aws_s3_bucket_server_side_encryption_configuration" "marketing_media" {
  bucket = aws_s3_bucket.marketing_media.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Objects are reachable only through CloudFront (OAC), never directly from S3.
resource "aws_s3_bucket_public_access_block" "marketing_media" {
  bucket                  = aws_s3_bucket.marketing_media.id
  block_public_acls       = true
  ignore_public_acls      = true
  block_public_policy     = false
  restrict_public_buckets = false
}

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "missfit-marketing-media-oac"
  description                       = "OAC for missfit-s3-media-prd (marketing site media)"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "media" {
  enabled     = true
  comment     = "MissFit marketing site media (video). Origin: ${aws_s3_bucket.marketing_media.id}"
  price_class = "PriceClass_100"

  origin {
    origin_id                = "s3-${aws_s3_bucket.marketing_media.id}"
    domain_name              = aws_s3_bucket.marketing_media.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-${aws_s3_bucket.marketing_media.id}"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD", "OPTIONS"]
    compress               = false

    # AWS managed policy: CachingOptimized. Leaves Range requests intact,
    # which is what lets viewers seek within a video.
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

data "aws_iam_policy_document" "marketing_media" {
  statement {
    sid       = "AllowCloudFrontServicePrincipalReadOnly"
    effect    = "Allow"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.marketing_media.arn}/*"]

    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.media.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "marketing_media" {
  bucket = aws_s3_bucket.marketing_media.id
  policy = data.aws_iam_policy_document.marketing_media.json
}

output "marketing_media_cdn_domain" {
  description = "CloudFront domain serving marketing-site media."
  value       = aws_cloudfront_distribution.media.domain_name
}
