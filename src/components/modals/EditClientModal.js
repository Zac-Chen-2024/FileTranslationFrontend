import React, { useState, useEffect } from 'react';
import { useApp } from '../../contexts/AppContext';
import { clientAPI } from '../../services/api';
import styles from './EditClientModal.module.css';

const EditClientModal = ({ client, isOpen, onClose, onSuccess }) => {
  const { actions } = useApp();
  const [formData, setFormData] = useState({
    name: '',
    caseType: '',
    caseDate: '',
    phone: '',
    email: '',
    address: '',
    notes: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (client && isOpen) {
      setFormData({
        name: client.name || '',
        caseType: client.caseType || '',
        caseDate: client.caseDate || '',
        phone: client.phone || '',
        email: client.email || '',
        address: client.address || '',
        notes: client.notes || ''
      });
    }
  }, [client, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.name.trim()) {
      actions.showNotification('错误', '客户姓名不能为空', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      // 这里需要添加更新客户信息的API
      await clientAPI.updateClient(client.cid, {
        name: formData.name,
        caseType: formData.caseType,
        caseDate: formData.caseDate,
        phone: formData.phone,
        email: formData.email,
        address: formData.address,
        notes: formData.notes
      });
      
      actions.showNotification('成功', '客户信息已更新', 'success');
      onSuccess();
      onClose();
    } catch (error) {
      actions.showNotification('错误', error.message || '更新客户信息失败', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <h3>编辑客户信息</h3>
          <button 
            className={styles.closeButton}
            onClick={onClose}
            disabled={isSubmitting}
          >
            ×
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className={styles.modalContent}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label>客户姓名 *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                className={styles.input}
                placeholder="请输入客户姓名"
                required
              />
            </div>
            
            <div className={styles.formGroup}>
              <label>案件类型</label>
              <input
                type="text"
                name="caseType"
                value={formData.caseType}
                onChange={handleChange}
                className={styles.input}
                placeholder="请输入案件类型"
              />
            </div>
            
            <div className={styles.formGroup}>
              <label>案件日期</label>
              <input
                type="date"
                name="caseDate"
                value={formData.caseDate}
                onChange={handleChange}
                className={styles.input}
              />
            </div>
            
            <div className={styles.formGroup}>
              <label>联系电话</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className={styles.input}
                placeholder="请输入联系电话"
              />
            </div>
            
            <div className={styles.formGroup}>
              <label>邮箱地址</label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={styles.input}
                placeholder="请输入邮箱地址"
              />
            </div>
            
            <div className={styles.formGroup}>
              <label>联系地址</label>
              <input
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className={styles.input}
                placeholder="请输入联系地址"
              />
            </div>
            
            <div className={styles.formGroup} style={{gridColumn: '1 / -1'}}>
              <label>备注信息</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                className={styles.textarea}
                placeholder="请输入备注信息"
                rows={3}
              />
            </div>
          </div>
          
          <div className={styles.modalFooter}>
            <button 
              type="button"
              className={styles.cancelButton}
              onClick={onClose}
              disabled={isSubmitting}
            >
              取消
            </button>
            <button 
              type="submit"
              className={styles.saveButton}
              disabled={isSubmitting}
            >
              {isSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default EditClientModal;