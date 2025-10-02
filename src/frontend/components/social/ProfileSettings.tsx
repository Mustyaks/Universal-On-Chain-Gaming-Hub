import React, { useState } from 'react';
import { Save, Eye, EyeOff, Users, MessageCircle, Trophy, Coins } from 'lucide-react';
import { SocialSettings } from '../../types/social';

interface ProfileSettingsProps {
  settings: SocialSettings;
  onUpdateSettings: (settings: SocialSettings) => Promise<void>;
}

const ProfileSettings: React.FC<ProfileSettingsProps> = ({
  settings,
  onUpdateSettings
}) => {
  const [formSettings, setFormSettings] = useState<SocialSettings>(settings);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const handleSettingChange = (key: keyof SocialSettings, value: any) => {
    setFormSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onUpdateSettings(formSettings);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to update settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setFormSettings(settings);
    setHasChanges(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">Privacy Settings</h2>
        
        <div className="space-y-6">
          {/* Profile Visibility */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              Profile Visibility
            </label>
            <div className="space-y-2">
              {[
                { value: 'PUBLIC', label: 'Public', description: 'Anyone can view your profile' },
                { value: 'FRIENDS', label: 'Friends Only', description: 'Only your friends can view your profile' },
                { value: 'PRIVATE', label: 'Private', description: 'Only you can view your profile' }
              ].map((option) => (
                <label key={option.value} className="flex items-start space-x-3 cursor-pointer">
                  <input
                    type="radio"
                    name="profileVisibility"
                    value={option.value}
                    checked={formSettings.profileVisibility === option.value}
                    onChange={(e) => handleSettingChange('profileVisibility', e.target.value)}
                    className="mt-1 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900">{option.label}</div>
                    <div className="text-sm text-gray-600">{option.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Content Visibility */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">What others can see</h3>
            
            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Trophy className="w-5 h-5 text-yellow-600" />
                  <div>
                    <div className="font-medium text-gray-900">Achievements</div>
                    <div className="text-sm text-gray-600">Show your gaming achievements</div>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={formSettings.showAchievements}
                    onChange={(e) => handleSettingChange('showAchievements', e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    onClick={() => handleSettingChange('showAchievements', !formSettings.showAchievements)}
                    className={`w-11 h-6 rounded-full cursor-pointer transition-colors ${
                      formSettings.showAchievements ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                        formSettings.showAchievements ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>
              </label>

              <label className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Coins className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-medium text-gray-900">Assets & NFTs</div>
                    <div className="text-sm text-gray-600">Show your gaming assets and collectibles</div>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={formSettings.showAssets}
                    onChange={(e) => handleSettingChange('showAssets', e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    onClick={() => handleSettingChange('showAssets', !formSettings.showAssets)}
                    className={`w-11 h-6 rounded-full cursor-pointer transition-colors ${
                      formSettings.showAssets ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                        formSettings.showAssets ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>
              </label>

              <label className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Eye className="w-5 h-5 text-blue-600" />
                  <div>
                    <div className="font-medium text-gray-900">Online Status</div>
                    <div className="text-sm text-gray-600">Show when you're online or in-game</div>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={formSettings.showOnlineStatus}
                    onChange={(e) => handleSettingChange('showOnlineStatus', e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    onClick={() => handleSettingChange('showOnlineStatus', !formSettings.showOnlineStatus)}
                    className={`w-11 h-6 rounded-full cursor-pointer transition-colors ${
                      formSettings.showOnlineStatus ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                        formSettings.showOnlineStatus ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Communication Settings */}
          <div className="border-t pt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Communication</h3>
            
            <div className="space-y-4">
              <label className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <Users className="w-5 h-5 text-purple-600" />
                  <div>
                    <div className="font-medium text-gray-900">Friend Requests</div>
                    <div className="text-sm text-gray-600">Allow others to send you friend requests</div>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={formSettings.allowFriendRequests}
                    onChange={(e) => handleSettingChange('allowFriendRequests', e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    onClick={() => handleSettingChange('allowFriendRequests', !formSettings.allowFriendRequests)}
                    className={`w-11 h-6 rounded-full cursor-pointer transition-colors ${
                      formSettings.allowFriendRequests ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                        formSettings.allowFriendRequests ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>
              </label>

              <label className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <MessageCircle className="w-5 h-5 text-green-600" />
                  <div>
                    <div className="font-medium text-gray-900">Direct Messages</div>
                    <div className="text-sm text-gray-600">Allow friends to send you messages</div>
                  </div>
                </div>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={formSettings.allowMessages}
                    onChange={(e) => handleSettingChange('allowMessages', e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    onClick={() => handleSettingChange('allowMessages', !formSettings.allowMessages)}
                    className={`w-11 h-6 rounded-full cursor-pointer transition-colors ${
                      formSettings.allowMessages ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full shadow transform transition-transform ${
                        formSettings.allowMessages ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </div>
                </div>
              </label>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        {hasChanges && (
          <div className="border-t pt-6 mt-6">
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleReset}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Reset
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Privacy Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start space-x-3">
          <Eye className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-blue-900">Privacy Notice</h3>
            <p className="text-sm text-blue-800 mt-1">
              Your privacy settings control how other players can interact with you and what information 
              they can see. You can change these settings at any time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileSettings;