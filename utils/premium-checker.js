const fetch = require('node-fetch');

/**
 * Check if an email belongs to a premium member via ActiveCampaign
 * @param {string} email - The email to check
 * @param {boolean} useMockData - Use mock data for testing (default: false)
 * @returns {Promise<Object>} - { isPremium: boolean, subscriptionStatus: string, details: object }
 */
async function isPremiumMember(email, useMockData = false) {
  // Mock mode for testing without AC credentials
  if (useMockData || !process.env.ACTIVECAMPAIGN_API_KEY) {
    return getMockPremiumStatus(email);
  }

  const AC_API_URL = process.env.ACTIVECAMPAIGN_API_URL;
  const AC_API_KEY = process.env.ACTIVECAMPAIGN_API_KEY;
  const PREMIUM_LIST_ID = process.env.ACTIVECAMPAIGN_PREMIUM_LIST_ID;
  const PREMIUM_TAG = process.env.ACTIVECAMPAIGN_PREMIUM_TAG || 'premium_active';

  if (!AC_API_URL || !AC_API_KEY) {
    console.warn('ActiveCampaign not configured. Using mock data.');
    return getMockPremiumStatus(email);
  }

  try {
    // Search for contact by email
    const searchResponse = await fetch(
      `${AC_API_URL}/api/3/contacts?email=${encodeURIComponent(email)}`,
      {
        headers: {
          'Api-Token': AC_API_KEY,
        },
      }
    );

    if (!searchResponse.ok) {
      throw new Error(`AC API error: ${searchResponse.status}`);
    }

    const searchData = await searchResponse.json();

    // Contact not found
    if (!searchData.contacts || searchData.contacts.length === 0) {
      return {
        isPremium: false,
        subscriptionStatus: 'not_found',
        details: {
          message: 'Contact not found in ActiveCampaign',
        },
      };
    }

    const contact = searchData.contacts[0];
    const contactId = contact.id;

    // Check if contact is on premium list
    let isOnPremiumList = false;
    if (PREMIUM_LIST_ID) {
      const listResponse = await fetch(
        `${AC_API_URL}/api/3/contacts/${contactId}/contactLists`,
        {
          headers: {
            'Api-Token': AC_API_KEY,
          },
        }
      );

      if (listResponse.ok) {
        const listData = await listResponse.json();
        isOnPremiumList = listData.contactLists.some((cl) => {
          const listId = String(cl.list || '').trim();
          const status = String(cl.status || '').trim();
          return listId === String(PREMIUM_LIST_ID).trim() && status === '1';
        });
      }
    }

    // Check if contact has premium tag
    const tagsResponse = await fetch(
      `${AC_API_URL}/api/3/contacts/${contactId}/contactTags`,
      {
        headers: {
          'Api-Token': AC_API_KEY,
        },
      }
    );

    let hasPremiumTag = false;
    if (tagsResponse.ok) {
      const tagsData = await tagsResponse.json();
      // Get all tags and check for premium tag
      const tagIds = tagsData.contactTags.map((ct) => ct.tag);

      // Fetch tag details to get tag names
      for (const tagId of tagIds) {
        const tagResponse = await fetch(`${AC_API_URL}/api/3/tags/${tagId}`, {
          headers: {
            'Api-Token': AC_API_KEY,
          },
        });

        if (tagResponse.ok) {
          const tagData = await tagResponse.json();
          const currentTag = String(tagData.tag.tag || '').trim().toLowerCase();
          const expectedTag = String(PREMIUM_TAG || '').trim().toLowerCase();
          if (currentTag === expectedTag) {
            hasPremiumTag = true;
            break;
          }
        }
      }
    }

    // Determine premium status
    const isPremium = isOnPremiumList || hasPremiumTag;

    return {
      isPremium,
      subscriptionStatus: isPremium ? 'active' : 'inactive',
      details: {
        contactId,
        isOnPremiumList,
        hasPremiumTag,
        email: contact.email,
      },
    };
  } catch (error) {
    console.error('Error checking premium status:', error);
    return {
      isPremium: false,
      subscriptionStatus: 'error',
      details: {
        error: error.message,
      },
    };
  }
}

/**
 * Get mock premium status for testing
 * @param {string} email - The email to check
 * @returns {Object} - Mock premium status
 */
function getMockPremiumStatus(email) {
  // Mock premium members for testing
  const mockPremiumEmails = [
    'premium@test.com',
    'vip@test.com',
    'eduardo@test.com',
  ];

  const isPremium = mockPremiumEmails.includes(email.toLowerCase());

  return {
    isPremium,
    subscriptionStatus: isPremium ? 'active' : 'free',
    details: {
      mode: 'mock',
      message: 'Using mock data for testing',
      email,
    },
  };
}

/**
 * Batch check multiple emails for premium status
 * @param {Array<string>} emails - Array of emails to check
 * @param {boolean} useMockData - Use mock data for testing
 * @returns {Promise<Object>} - Object mapping email to premium status
 */
async function batchCheckPremiumStatus(emails, useMockData = false) {
  const results = {};

  for (const email of emails) {
    results[email] = await isPremiumMember(email, useMockData);
  }

  return results;
}

/**
 * Filter recipients by premium status
 * @param {Array<Object>} tickets - Array of ticket objects with recipient_email
 * @param {boolean} premiumOnly - If true, return only premium members
 * @param {boolean} useMockData - Use mock data for testing
 * @returns {Promise<Array>} - Filtered array of tickets
 */
async function filterByPremiumStatus(tickets, premiumOnly = false, useMockData = false) {
  const filtered = [];

  for (const ticket of tickets) {
    const status = await isPremiumMember(ticket.recipient_email, useMockData);

    if (premiumOnly && status.isPremium) {
      filtered.push({ ...ticket, premiumStatus: status });
    } else if (!premiumOnly && !status.isPremium) {
      filtered.push({ ...ticket, premiumStatus: status });
    }
  }

  return filtered;
}

module.exports = {
  isPremiumMember,
  getMockPremiumStatus,
  batchCheckPremiumStatus,
  filterByPremiumStatus,
};
