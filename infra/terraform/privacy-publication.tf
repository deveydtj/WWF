# Publication prerequisites are enforced by default. The owner can explicitly
# defer this release gate; it does not certify COPPA compliance.
variable "enforce_privacy_publication_gate" {
  description = "Enforce operator details and privacy notice review before publication. Disable only when the owner explicitly defers this work."
  type        = bool
  default     = true
  nullable    = false
}

variable "privacy_operator" {
  description = "Verified operator details for the public privacy notice; complete before publication."
  type = object({
    legal_name      = string
    mailing_address = string
    phone           = string
    email           = string
    website_url     = string
  })
  nullable = false
  default = {
    legal_name      = ""
    mailing_address = ""
    phone           = ""
    email           = ""
    website_url     = ""
  }
}

variable "privacy_notice_reviewed" {
  description = "Set true only after publishing and reviewing an accurate privacy notice containing these operator details. This is not COPPA certification."
  type        = bool
  default     = false
  nullable    = false
}

resource "terraform_data" "privacy_publication_gate" {
  count = var.enforce_privacy_publication_gate ? 1 : 0

  lifecycle {
    precondition {
      condition = alltrue([
        for value in values(var.privacy_operator) : try(length(trimspace(value)) > 0, false)
      ])
      error_message = "PUBLICATION BLOCKED: provide privacy_operator legal_name, mailing_address, phone, email, and website_url. Operator details were deferred; see docs/COPPA_READINESS.md."
    }
    precondition {
      condition = (
        can(regex("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$", var.privacy_operator.email)) &&
        can(regex("^https://[^/\\s]+", var.privacy_operator.website_url))
      )
      error_message = "PUBLICATION BLOCKED: privacy_operator needs a valid privacy contact email and HTTPS website URL."
    }
    precondition {
      condition     = var.privacy_notice_reviewed
      error_message = "PUBLICATION BLOCKED: the operator privacy notice must be complete and reviewed before setting privacy_notice_reviewed=true. This flag does not certify COPPA compliance."
    }
  }
}
