import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { JSX, useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface GeneData {
  id: number;
  name: string;
  relationship: string;
  healthScore: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
  encryptedValueHandle?: string;
}

interface FamilyAnalysis {
  geneticCompatibility: number;
  healthRisk: number;
  inheritanceProbability: number;
  relationshipStrength: number;
  privacyScore: number;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [familyMembers, setFamilyMembers] = useState<GeneData[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingMember, setCreatingMember] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newMemberData, setNewMemberData] = useState({ name: "", relationship: "", healthScore: "" });
  const [selectedMember, setSelectedMember] = useState<GeneData | null>(null);
  const [decryptedData, setDecryptedData] = useState<{ healthScore: number | null }>({ healthScore: null });
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [showFAQ, setShowFAQ] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting} = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized) return;
      if (fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        console.log('Initializing FHEVM for genetic data...');
        await initialize();
        console.log('FHEVM initialized successfully');
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed. Please check your wallet connection." 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load genetic data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const membersList: GeneData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          membersList.push({
            id: parseInt(businessId.replace('member-', '')) || Date.now(),
            name: businessData.name,
            relationship: businessId,
            healthScore: businessId,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading genetic data:', e);
        }
      }
      
      setFamilyMembers(membersList);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load genetic data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createMember = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingMember(true);
    setTransactionStatus({ visible: true, status: "pending", message: "使用Zama FHE创建加密基因记录..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("获取合约失败");
      
      const healthValue = parseInt(newMemberData.healthScore) || 0;
      const businessId = `member-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, healthValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newMemberData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        parseInt(newMemberData.relationship) || 0,
        0,
        "家族成员基因数据"
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "等待交易确认..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "基因记录创建成功！" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewMemberData({ name: "", relationship: "", healthScore: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "用户取消了交易" 
        : "提交失败: " + (e.message || "未知错误");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingMember(false); 
    }
  };

  const decryptData = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "请先连接钱包" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "数据已在链上验证" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "正在链上验证解密..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "基因数据解密验证成功！" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "数据已在链上验证" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "解密失败: " + (e.message || "未知错误") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const analyzeGeneticData = (member: GeneData, decryptedHealth: number | null): FamilyAnalysis => {
    const health = member.isVerified ? (member.decryptedValue || 0) : (decryptedHealth || member.publicValue1 || 5);
    const relationship = member.publicValue1 || 5;
    
    const geneticCompatibility = Math.min(100, Math.round((health * 0.6 + relationship * 0.4) * 10));
    const healthRisk = Math.max(5, Math.min(95, 100 - (health * 0.8 + relationship * 0.2)));
    const inheritanceProbability = Math.round((health * 0.3 + relationship * 0.7) * 12);
    const relationshipStrength = Math.min(95, Math.round((health * 0.4 + relationship * 0.6) * 15));
    const privacyScore = Math.min(100, Math.round((health * 0.2 + relationship * 0.8) * 20));

    return {
      geneticCompatibility,
      healthRisk,
      inheritanceProbability,
      relationshipStrength,
      privacyScore
    };
  };

  const renderDashboard = () => {
    const totalMembers = familyMembers.length;
    const verifiedMembers = familyMembers.filter(m => m.isVerified).length;
    const avgHealth = familyMembers.length > 0 
      ? familyMembers.reduce((sum, m) => sum + m.publicValue1, 0) / familyMembers.length 
      : 0;
    
    const recentMembers = familyMembers.filter(m => 
      Date.now()/1000 - m.timestamp < 60 * 60 * 24 * 7
    ).length;

    return (
      <div className="dashboard-panels">
        <div className="panel metal-panel">
          <h3>家族成员总数</h3>
          <div className="stat-value">{totalMembers}</div>
          <div className="stat-trend">+{recentMembers} 本周新增</div>
        </div>
        
        <div className="panel metal-panel">
          <h3>已验证数据</h3>
          <div className="stat-value">{verifiedMembers}/{totalMembers}</div>
          <div className="stat-trend">链上已验证</div>
        </div>
        
        <div className="panel metal-panel">
          <h3>平均健康评分</h3>
          <div className="stat-value">{avgHealth.toFixed(1)}/10</div>
          <div className="stat-trend">FHE保护</div>
        </div>
      </div>
    );
  };

  const renderGeneticChart = (member: GeneData, decryptedHealth: number | null) => {
    const analysis = analyzeGeneticData(member, decryptedHealth);
    
    return (
      <div className="analysis-chart">
        <div className="chart-row">
          <div className="chart-label">基因兼容性</div>
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ width: `${analysis.geneticCompatibility}%` }}
            >
              <span className="bar-value">{analysis.geneticCompatibility}</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">健康风险</div>
          <div className="chart-bar">
            <div 
              className="bar-fill risk" 
              style={{ width: `${analysis.healthRisk}%` }}
            >
              <span className="bar-value">{analysis.healthRisk}</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">遗传概率</div>
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ width: `${Math.min(100, analysis.inheritanceProbability)}%` }}
            >
              <span className="bar-value">{analysis.inheritanceProbability}</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">亲缘强度</div>
          <div className="chart-bar">
            <div 
              className="bar-fill" 
              style={{ width: `${analysis.relationshipStrength}%` }}
            >
              <span className="bar-value">{analysis.relationshipStrength}</span>
            </div>
          </div>
        </div>
        <div className="chart-row">
          <div className="chart-label">隐私评分</div>
          <div className="chart-bar">
            <div 
              className="bar-fill growth" 
              style={{ width: `${analysis.privacyScore}%` }}
            >
              <span className="bar-value">{analysis.privacyScore}</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderFHEFlow = () => {
    return (
      <div className="fhe-flow">
        <div className="flow-step">
          <div className="step-icon">🧬</div>
          <div className="step-content">
            <h4>基因数据加密</h4>
            <p>使用Zama FHE加密健康数据</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">🔗</div>
          <div className="step-content">
            <h4>链上存储</h4>
            <p>加密数据安全存储在区块链</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">🔓</div>
          <div className="step-content">
            <h4>同态计算</h4>
            <p>不解密情况下进行亲缘关系计算</p>
          </div>
        </div>
        <div className="flow-arrow">→</div>
        <div className="flow-step">
          <div className="step-icon">✅</div>
          <div className="step-content">
            <h4>链上验证</h4>
            <p>通过FHE.checkSignatures验证解密</p>
          </div>
        </div>
      </div>
    );
  };

  const filteredMembers = familyMembers.filter(member => 
    member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    member.relationship.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>🧬 基因家譜隱私鏈</h1>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🧬</div>
            <h2>连接钱包开始使用</h2>
            <p>请连接您的钱包来初始化加密基因系统，开始构建隐私保护的家谱树。</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>点击上方按钮连接钱包</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>FHE系统将自动初始化</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>开始创建加密的家族基因记录</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>正在初始化FHE加密系统...</p>
        <p>状态: {fhevmInitializing ? "初始化FHEVM" : status}</p>
        <p className="loading-note">这可能需要一些时间</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>加载加密基因系统...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>🧬 基因家譜隱私鏈</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn"
          >
            + 添加家族成员
          </button>
          <button 
            onClick={() => setShowFAQ(true)} 
            className="faq-btn"
          >
            ❓ 常见问题
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="dashboard-section">
          <h2>家族基因数据分析 (FHE 🔐)</h2>
          {renderDashboard()}
          
          <div className="panel metal-panel full-width">
            <h3>FHE 🔐 同态加密流程</h3>
            {renderFHEFlow()}
          </div>
        </div>
        
        <div className="members-section">
          <div className="section-header">
            <h2>家族成员列表</h2>
            <div className="header-actions">
              <input 
                type="text"
                placeholder="搜索成员姓名或关系..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="search-input"
              />
              <button 
                onClick={loadData} 
                className="refresh-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "刷新中..." : "刷新"}
              </button>
            </div>
          </div>
          
          <div className="members-list">
            {filteredMembers.length === 0 ? (
              <div className="no-members">
                <p>未找到家族成员记录</p>
                <button 
                  className="create-btn" 
                  onClick={() => setShowCreateModal(true)}
                >
                  添加第一个成员
                </button>
              </div>
            ) : filteredMembers.map((member, index) => (
              <div 
                className={`member-item ${selectedMember?.id === member.id ? "selected" : ""} ${member.isVerified ? "verified" : ""}`} 
                key={index}
                onClick={() => setSelectedMember(member)}
              >
                <div className="member-title">{member.name}</div>
                <div className="member-meta">
                  <span>关系度: {member.publicValue1}/10</span>
                  <span>添加时间: {new Date(member.timestamp * 1000).toLocaleDateString()}</span>
                </div>
                <div className="member-status">
                  状态: {member.isVerified ? "✅ 链上已验证" : "🔓 待验证"}
                  {member.isVerified && member.decryptedValue && (
                    <span className="verified-score">健康评分: {member.decryptedValue}</span>
                  )}
                </div>
                <div className="member-creator">创建者: {member.creator.substring(0, 6)}...{member.creator.substring(38)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateMember 
          onSubmit={createMember} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingMember} 
          memberData={newMemberData} 
          setMemberData={setNewMemberData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedMember && (
        <MemberDetailModal 
          member={selectedMember} 
          onClose={() => { 
            setSelectedMember(null); 
            setDecryptedData({ healthScore: null }); 
          }} 
          decryptedData={decryptedData} 
          setDecryptedData={setDecryptedData} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptData={() => decryptData(selectedMember.relationship)}
          renderGeneticChart={renderGeneticChart}
        />
      )}
      
      {showFAQ && (
        <FAQModal onClose={() => setShowFAQ(false)} />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateMember: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  memberData: any;
  setMemberData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, memberData, setMemberData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (name === 'healthScore') {
      const intValue = value.replace(/[^\d]/g, '');
      setMemberData({ ...memberData, [name]: intValue });
    } else {
      setMemberData({ ...memberData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-member-modal">
        <div className="modal-header">
          <h2>添加家族成员</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <strong>FHE 🔐 加密保护</strong>
            <p>健康评分将使用Zama FHE进行加密（仅支持整数）</p>
          </div>
          
          <div className="form-group">
            <label>成员姓名 *</label>
            <input 
              type="text" 
              name="name" 
              value={memberData.name} 
              onChange={handleChange} 
              placeholder="输入成员姓名..." 
            />
          </div>
          
          <div className="form-group">
            <label>健康评分 (整数) *</label>
            <input 
              type="number" 
              name="healthScore" 
              value={memberData.healthScore} 
              onChange={handleChange} 
              placeholder="输入健康评分..." 
              step="1"
              min="0"
            />
            <div className="data-type-label">FHE加密整数</div>
          </div>
          
          <div className="form-group">
            <label>亲缘关系度 (1-10) *</label>
            <input 
              type="number" 
              min="1" 
              max="10" 
              name="relationship" 
              value={memberData.relationship} 
              onChange={handleChange} 
              placeholder="输入关系度..." 
            />
            <div className="data-type-label">公开数据</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">取消</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !memberData.name || !memberData.healthScore || !memberData.relationship} 
            className="submit-btn"
          >
            {creating || isEncrypting ? "加密并创建中..." : "创建记录"}
          </button>
        </div>
      </div>
    </div>
  );
};

const MemberDetailModal: React.FC<{
  member: GeneData;
  onClose: () => void;
  decryptedData: { healthScore: number | null };
  setDecryptedData: (value: { healthScore: number | null }) => void;
  isDecrypting: boolean;
  decryptData: () => Promise<number | null>;
  renderGeneticChart: (member: GeneData, decryptedHealth: number | null) => JSX.Element;
}> = ({ member, onClose, decryptedData, setDecryptedData, isDecrypting, decryptData, renderGeneticChart }) => {
  const handleDecrypt = async () => {
    if (decryptedData.healthScore !== null) { 
      setDecryptedData({ healthScore: null }); 
      return; 
    }
    
    const decrypted = await decryptData();
    if (decrypted !== null) {
      setDecryptedData({ healthScore: decrypted });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="member-detail-modal">
        <div className="modal-header">
          <h2>成员基因详情</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="member-info">
            <div className="info-item">
              <span>成员姓名:</span>
              <strong>{member.name}</strong>
            </div>
            <div className="info-item">
              <span>创建者:</span>
              <strong>{member.creator.substring(0, 6)}...{member.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>添加时间:</span>
              <strong>{new Date(member.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
            <div className="info-item">
              <span>亲缘关系度:</span>
              <strong>{member.publicValue1}/10</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>加密健康数据</h3>
            
            <div className="data-row">
              <div className="data-label">健康评分:</div>
              <div className="data-value">
                {member.isVerified && member.decryptedValue ? 
                  `${member.decryptedValue} (链上已验证)` : 
                  decryptedData.healthScore !== null ? 
                  `${decryptedData.healthScore} (本地解密)` : 
                  "🔒 FHE加密整数"
                }
              </div>
              <button 
                className={`decrypt-btn ${(member.isVerified || decryptedData.healthScore !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "🔓 验证中..."
                ) : member.isVerified ? (
                  "✅ 已验证"
                ) : decryptedData.healthScore !== null ? (
                  "🔄 重新验证"
                ) : (
                  "🔓 验证解密"
                )}
              </button>
            </div>
            
            <div className="fhe-info">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE 🔐 同态加密保护</strong>
                <p>数据在链上加密存储。点击"验证解密"进行离线解密和链上验证。</p>
              </div>
            </div>
          </div>
          
          {(member.isVerified || decryptedData.healthScore !== null) && (
            <div className="analysis-section">
              <h3>基因分析结果</h3>
              {renderGeneticChart(
                member, 
                member.isVerified ? member.decryptedValue || null : decryptedData.healthScore
              )}
              
              <div className="decrypted-values">
                <div className="value-item">
                  <span>健康评分:</span>
                  <strong>
                    {member.isVerified ? 
                      `${member.decryptedValue} (链上已验证)` : 
                      `${decryptedData.healthScore} (本地解密)`
                    }
                  </strong>
                  <span className={`data-badge ${member.isVerified ? 'verified' : 'local'}`}>
                    {member.isVerified ? '链上已验证' : '本地解密'}
                  </span>
                </div>
                <div className="value-item">
                  <span>亲缘关系:</span>
                  <strong>{member.publicValue1}/10</strong>
                  <span className="data-badge public">公开数据</span>
                </div>
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">关闭</button>
          {!member.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn"
            >
              {isDecrypting ? "链上验证中..." : "链上验证"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const FAQModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const faqs = [
    {
      question: "什么是同态加密？",
      answer: "同态加密允许在加密数据上直接进行计算，无需解密即可获得加密结果，保护基因隐私。"
    },
    {
      question: "为什么使用FHE技术？",
      answer: "全同态加密确保家族基因数据在计算亲缘关系时始终保持加密状态，不泄露敏感健康信息。"
    },
    {
      question: "数据安全性如何保证？",
      answer: "所有基因数据使用Zama FHE加密后上链，只有授权用户才能解密查看具体数值。"
    },
    {
      question: "支持哪些类型的基因数据？",
      answer: "目前支持整数类型的健康评分和关系度计算，未来将扩展更多基因数据类型。"
    }
  ];

  return (
    <div className="modal-overlay">
      <div className="faq-modal">
        <div className="modal-header">
          <h2>🧬 常见问题解答</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="faq-list">
            {faqs.map((faq, index) => (
              <div key={index} className="faq-item">
                <h4>{faq.question}</h4>
                <p>{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">关闭</button>
        </div>
      </div>
    </div>
  );
};

export default App;


